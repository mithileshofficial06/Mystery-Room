/**
 * Look at the room without a human looking at the room.
 *
 *   npm run dev -- -p 3100
 *   npm run shoot                    # opening view
 *   npm run shoot -- --script solve  # walk the whole torch puzzle
 *
 * This exists because of how a broken 3D scene fails: it renders a black
 * rectangle. The DOM overlay keeps drawing, nothing throws, no error boundary
 * fires, and the only evidence anywhere is a line in a console nobody is
 * reading. A screenshot plus the console log is the difference between
 * diagnosing that in one pass and guessing at it in six.
 *
 * THE ROUTE STEERS WITH FEEDBACK. An earlier version walked for a fixed
 * number of milliseconds and turned by eyeballed pixel drags. Both are wrong
 * here: distance walked depends on frame rate, and headless Chromium renders
 * WebGL on the CPU at a fraction of real speed, so the same route lands
 * somewhere different every run. It wandered into a corner and would have
 * reported a clean run for a puzzle it never touched — the exact failure the
 * implementation guide warns about, a check that cannot fail.
 *
 * So every move reads the player's true position back out of the page
 * (`window.__room`, published by MysteryRoomPlayer in development only) and
 * aims by computed angle. If the route cannot reach a thing, it says so.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const url = opt("url", "http://localhost:3100/");
const out = opt("out", "shots/room.png");
const script = opt("script", "none");

/** Must match MysteryRoomPlayer.tsx. */
const LOOK_SENSITIVITY = 0.0026;

/**
 * Must match the exported constants in MysteryRoomTools.tsx.
 *
 * Neither tool is reachable in one click any more: the torch is in a recess
 * behind the wall clock and the gel is inside a hollowed-out book, so the
 * route has to open the container first. That gating is the thing most worth
 * testing here — "the container opened" and "the tool was taken" are separate
 * facts, and the checks below assert they stay separate.
 */
const CLOCK = [2.0, 2.05, -5.79];
const TORCH = [2.0, 2.02, -5.88];
const BOOK = [-4.74, 1.68, -2.07];
const GEL = [-4.76, 1.67, -2.07];
/**
 * The secret paper. The board sits at [5.88, 1.72, -1.0] rotated -90 degrees
 * about Y, so its local +X maps to world +Z: a local offset of [0.42, -0.18]
 * lands at world z = -1.0 + 0.42, NOT -1.0 - 0.42. Getting that sign wrong
 * pointed this route a metre off the paper, and the "raw light reveals
 * nothing" check then passed because the beam was nowhere near it rather than
 * because the gel was missing — a check that could not fail.
 */
const BOARD_PAPER = [5.85, 1.54, -0.58];

mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const logs = [];
const failures = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));

// Not "networkidle": Next's dev server holds an HMR socket open forever, so
// the page is never idle and this would always time out.
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");
await page.waitForTimeout(4000);

/**
 * Wait for a canvas that has actually been laid out.
 *
 * waitForSelector only proves the element is in the DOM. On the first load
 * after an edit, Next is still compiling and the canvas is present at zero
 * size, so boundingBox() returns null and the whole run dies on line one with
 * "Cannot read properties of null" — which looks like a broken room and is
 * really just a slow rebuild.
 */
let box = null;
for (let i = 0; i < 30 && !(box && box.width > 0); i += 1) {
  box = await page.locator("canvas").boundingBox();
  if (!(box && box.width > 0)) await page.waitForTimeout(1000);
}
if (!box || box.width === 0) {
  console.log("no canvas was ever laid out — is the dev server compiling, or did the room throw?");
  console.log("=== CONSOLE (" + logs.length + ") ===");
  for (const l of logs) console.log(l);
  await browser.close();
  process.exit(1);
}
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

/** The player's real position and orientation, straight from the running app. */
const state = () => page.evaluate(() => window.__room);

/**
 * Six interpolation steps, not twenty-four. The look handler integrates every
 * pointermove, so the number of steps changes nothing about where the camera
 * ends up — but each one is a round trip to the browser, and at four hundred
 * drags a run that was most of the wall-clock time.
 */
async function drag(dx, dy) {
  const startX = centre.x - dx / 2;
  const startY = centre.y - dy / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(60);
}

/** Turn to an absolute yaw/pitch, splitting long turns so no drag leaves the canvas. */
async function setView(targetYaw, targetPitch) {
  const now = await state();
  // Take the short way round.
  let dYaw = targetYaw - now.yaw;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;

  const totalDx = -dYaw / LOOK_SENSITIVITY;
  const totalDy = -(targetPitch - now.pitch) / LOOK_SENSITIVITY;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(totalDx), Math.abs(totalDy)) / 260));
  for (let i = 0; i < steps; i += 1) await drag(totalDx / steps, totalDy / steps);
}

/** Yaw and pitch that put `to` under the crosshair, from wherever the player actually is. */
function aim(from, to) {
  const dx = to[0] - from.x;
  const dz = to[2] - from.z;
  const dy = to[1] - from.y;
  // The camera looks down -Z, so its direction is (-sin yaw, ., -cos yaw).
  return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
}

const distanceTo = (from, to) => Math.hypot(to[0] - from.x, to[2] - from.z);

/**
 * Walk toward a point until within `stopAt` metres, or until three
 * consecutive pushes make no progress (blocked by furniture, which is a
 * legitimate stop — the pickups are all reachable from outside a footprint).
 */
async function walkTo(to, stopAt = 1.2, maxSteps = 40) {
  let stalled = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    const now = await state();
    const gap = distanceTo(now, to);
    if (gap <= stopAt) return now;

    // Only re-aim when actually off course. Turning by a hundredth of a
    // radian before every stride costs a drag and buys nothing.
    const [wantYaw] = aim(now, to);
    let offBy = wantYaw - now.yaw;
    while (offBy > Math.PI) offBy -= Math.PI * 2;
    while (offBy < -Math.PI) offBy += Math.PI * 2;
    if (Math.abs(offBy) > 0.1) await setView(wantYaw, 0);

    // Long enough per step to cover ground at SwiftShader's frame rate — a
    // 10-metre crossing at 26 short steps ran out of budget halfway and left
    // the route staring at the board from across the room.
    await page.keyboard.down("w");
    await page.waitForTimeout(650);
    await page.keyboard.up("w");
    await page.waitForTimeout(70);

    const after = await state();
    if (process.env.ROOM_TRACE) {
      console.log(
        `    step ${i}: (${now.x.toFixed(2)}, ${now.z.toFixed(2)}) -> ` +
          `(${after.x.toFixed(2)}, ${after.z.toFixed(2)}) yaw=${after.yaw.toFixed(2)} gap=${gap.toFixed(2)}`
      );
    }
    if (Math.hypot(after.x - now.x, after.z - now.z) < 0.05) {
      stalled += 1;
      // Walking straight at the target is enough for an open floor and
      // useless against the side of a desk. Slide along the obstacle instead
      // — and slide the SAME way each time: alternating left and right just
      // undoes the previous step, which is how an earlier version of this
      // spent forty steps oscillating against a chair while reporting that
      // it was making progress. Six steps one way, then six the other, then
      // admit defeat.
      const key = stalled <= 4 ? "d" : "a";
      if (stalled > 8) return after;
      await page.keyboard.down(key);
      await page.waitForTimeout(500);
      await page.keyboard.up(key);
      await page.waitForTimeout(70);
    } else {
      stalled = 0;
    }
  }
  return state();
}

/**
 * Walk a list of floor waypoints, then a final target.
 *
 * Straight-line walking plus stall recovery gets around one desk. It does not
 * get from the spawn point to the back wall past a bookcase, a terminal table
 * and a step ladder — it wedges into the first corner it finds and the route
 * silently verifies nothing. The waypoints are the corridors between
 * footprints; they are chosen from OBSTACLES in MysteryRoomScene, not by eye.
 */
async function route(waypoints, target, stopAt) {
  for (const point of waypoints) {
    await walkTo([point[0], 0, point[1]], 0.5, 16);
  }
  return walkTo(target, stopAt, 24);
}

/**
 * Aim at a point and click it, returning how far away the player was.
 *
 * The distance matters. A three.js raycast has no range, so a click lands on
 * anything the crosshair covers however far off it is — this route once
 * "opened" the book from four metres away, across the room, because it had
 * wedged itself against a bookcase and the angle happened to be right. Every
 * check passed and none of them meant anything: no player could have found a
 * book at eye height from across a room. So the caller asserts on the range
 * as well as the outcome.
 */
async function lookAndClick(target, settle = 900) {
  const at = await state();
  await setView(...aim(at, target));
  await page.waitForTimeout(150);
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(settle);
  return distanceTo(at, target);
}

/** Arm's reach, near enough. Anything further is the route cheating. */
const REACH = 2.0;

/**
 * The desk lamp, which blinks Morse continuously.
 *
 * Only the canvas is sampled, never the page: the HUD's transient note line
 * changes on its own and would make any two full-page shots differ, so a
 * frozen lamp would still "pass". Nothing else in shot ought to move — the
 * ceiling fan is the room's other animated thing and is kept out of frame by
 * looking down at the desk.
 */
const LAMP = [-3.1, 0.94, -3.14];

async function lampBlinks(samples = 7, everyMs = 350) {
  const frames = [];
  for (let i = 0; i < samples; i += 1) {
    frames.push(await page.locator("canvas").screenshot());
    await page.waitForTimeout(everyMs);
  }
  return frames.some((f) => !f.equals(frames[0]));
}

/**
 * A screenshot must never be able to fail the run.
 *
 * Playwright waits for web fonts before a page screenshot, and under a
 * software GL renderer that wait has timed out and killed a run that had
 * already passed thirteen checks. A missing picture is a nuisance; losing the
 * checks because of one is not acceptable.
 */
async function shot(suffix) {
  try {
    await page.screenshot({ path: out.replace(/\.png$/, `-${suffix}.png`), timeout: 15000 });
  } catch {
    console.log(`  (screenshot "${suffix}" timed out — carrying on)`);
  }
}
const tasksText = async () =>
  (await page.locator("text=/TASKS \\d+\\/\\d+/").first().textContent()).trim();
const chips = async () => (await page.locator("text=/TORCH ·/").first().textContent()).trim()
  + " | " + (await page.locator("text=/GEL ·/").first().textContent()).trim();

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` — got ${JSON.stringify(detail)}`}`);
  }
}

/** Is the transient feedback line currently saying this? */
const noteSays = (pattern) => page.locator(`text=${pattern}`).first().isVisible();

if (script === "solve") {
  console.log("\n-- Open the wall clock and take the torch from behind it --");
  // Down the right-hand side of the room, then west along the lane between
  // the terminal table and the step ladder. These are the gaps between the
  // inflated footprints in OBSTACLES, not a guess.
  await route([[3.5, 1.5], [4.5, -0.5], [4.5, -2.5], [4.3, -4.0], [2.5, -4.2]], CLOCK, 1.0);
  await shot("1-clock");
  const clockRange = await lookAndClick(CLOCK, 1100);
  check("the wall clock is reachable on foot", clockRange <= REACH, `${clockRange.toFixed(2)}m`);
  check("the wall clock swings aside when clicked", await noteSays("/recess cut into the wall/"), null);

  // Opening a container and taking what is inside it are two different
  // things. If the clock handed over the torch, the recess would be scenery.
  check(
    "opening the clock does not hand over the torch",
    (await chips()).includes("TORCH · ?"),
    await chips()
  );
  await shot("2-recess");

  await lookAndClick(TORCH);
  check("the torch can be taken from the recess", (await chips()).includes("TORCH · OFF"), await chips());

  await page.keyboard.press("f");
  await page.waitForTimeout(500);
  await setView((await state()).yaw, -0.15);
  await shot("3-torch-on");
  check("the torch switches on", (await chips()).includes("TORCH · ON"), await chips());

  console.log("\n-- Open the book and take the gel, but do not fit it yet --");
  await route(
    [[2.5, -4.2], [4.3, -4.0], [4.5, -2.5], [4.5, -0.5], [0, -0.6], [-3.5, -0.6], [-3.5, -1.7]],
    [BOOK[0], 0, BOOK[2]],
    1.35
  );
  await shot("4-book");
  const bookRange = await lookAndClick(BOOK, 1100);
  check("the book is reachable on foot", bookRange <= REACH, `${bookRange.toFixed(2)}m`);
  check("the book opens when clicked", await noteSays("/pages have been cut away/"), null);
  check("opening the book does not hand over the gel", (await chips()).includes("GEL · ?"), await chips());
  await shot("5-book-open");

  await lookAndClick(GEL);
  check("the gel can be taken from inside the book", (await chips()).includes("GEL · LOOSE"), await chips());

  /**
   * The two board checks below are run FROM THE SAME SPOT, aimed at the same
   * paper, with the gel as the only difference between them. Walking away to
   * fetch the gel and coming back would change position, aim and distance all
   * at once, and a pass would prove nothing about which of the four reveal
   * conditions was doing the work. Stand still, look at the paper, prove it is
   * blank, press one key, prove it is not.
   */
  console.log("\n-- The same paper, raw light then blue --");
  const at = await route([[-3.5, -0.6], [0, -0.6], [4.3, -0.9]], BOARD_PAPER, 1.6);
  await setView(...aim(at, BOARD_PAPER));
  await page.waitForTimeout(1200);
  await shot("6-board-raw-light");
  check(
    "raw torchlight lands on the paper and reveals nothing",
    (await tasksText()) === "TASKS 0/5",
    await tasksText()
  );
  check(
    "no phrase in the HUD under raw light",
    !(await page.locator("text=YOU GOT THE ANSWER").first().isVisible()),
    null
  );

  // One keypress. Nothing else changes — not position, not aim, not distance.
  await page.keyboard.press("g");
  await page.waitForTimeout(1500);
  await shot("7-board-blue-light");
  check("the gel clips over the lens", (await chips()).includes("GEL · FITTED"), await chips());
  check("blue light reveals the phrase", (await tasksText()) === "TASKS 1/5", await tasksText());
  check(
    "the phrase is echoed in the HUD",
    await page.locator("text=YOU GOT THE ANSWER").first().isVisible(),
    null
  );

  console.log("\n-- The desk lamp is signalling --");
  const lampAt = await route([[4.3, -0.9], [0, -0.6], [0, -2.0]], [-0.2, 0, -3.0], 0.5);
  await setView(...aim(lampAt, LAMP));
  // Switch the torch off first: a lit beam pointed at the desk washes the
  // lamp out and the difference between its two states goes with it.
  await page.keyboard.press("f");
  await page.waitForTimeout(600);
  await shot("8-lamp");
  check("the desk lamp blinks rather than sitting still", await lampBlinks(), null);
}

await page.screenshot({ path: out });

if (script === "solve") {
  console.log(
    failures.length === 0
      ? "\nALL CHECKS PASSED\n"
      : `\n${failures.length} FAILED:\n${failures.map((f) => "  " + f).join("\n")}\n`
  );
}
console.log("=== CONSOLE (" + logs.length + ") ===");
for (const l of logs) console.log(l);

await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
