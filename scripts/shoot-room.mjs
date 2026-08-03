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

/** Must match MysteryRoomTools.tsx and manifest.ts. */
const TORCH = [-2.35, 0.09, -2.35];
const GEL = [-4.25, 1.2, -2.2];
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

const box = await page.locator("canvas").boundingBox();
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

/** The player's real position and orientation, straight from the running app. */
const state = () => page.evaluate(() => window.__room);

async function drag(dx, dy) {
  const startX = centre.x - dx / 2;
  const startY = centre.y - dy / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(110);
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
async function walkTo(to, stopAt = 1.2, maxSteps = 70) {
  let stalled = 0;
  for (let i = 0; i < maxSteps; i += 1) {
    const now = await state();
    const gap = distanceTo(now, to);
    if (gap <= stopAt) return now;

    const [wantYaw] = aim(now, to);
    await setView(wantYaw, 0);

    // Long enough per step to cover ground at SwiftShader's frame rate — a
    // 10-metre crossing at 26 short steps ran out of budget halfway and left
    // the route staring at the board from across the room.
    await page.keyboard.down("w");
    await page.waitForTimeout(420);
    await page.keyboard.up("w");
    await page.waitForTimeout(110);

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
      const key = stalled <= 6 ? "d" : "a";
      if (stalled > 12) return after;
      await page.keyboard.down(key);
      await page.waitForTimeout(420);
      await page.keyboard.up(key);
      await page.waitForTimeout(110);
    } else {
      stalled = 0;
    }
  }
  return state();
}

const shot = (suffix) => page.screenshot({ path: out.replace(/\.png$/, `-${suffix}.png`) });
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

if (script === "solve") {
  console.log("\n-- Find and switch on the torch --");
  let at = await walkTo(TORCH, 2.4);
  await setView(...aim(at, TORCH));
  await shot("1-torch-found");
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(700);
  check("the torch can be found and picked up", (await chips()).includes("TORCH · OFF"), await chips());

  await page.keyboard.press("f");
  await page.waitForTimeout(500);
  await setView((await state()).yaw, -0.15);
  await shot("2-torch-on");
  check("the torch switches on", (await chips()).includes("TORCH · ON"), await chips());

  console.log("\n-- Find the blue gel, but do not fit it yet --");
  at = await walkTo(GEL, 1.0);
  await setView(...aim(at, GEL));
  await shot("3-gel-found");
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(700);
  check("the gel can be found and picked up", (await chips()).includes("GEL · LOOSE"), await chips());

  /**
   * The two board checks below are run FROM THE SAME SPOT, aimed at the same
   * paper, with the gel as the only difference between them. Walking away to
   * fetch the gel and coming back would change position, aim and distance all
   * at once, and a pass would prove nothing about which of the four reveal
   * conditions was doing the work. Stand still, look at the paper, prove it is
   * blank, press one key, prove it is not.
   */
  console.log("\n-- The same paper, raw light then blue --");
  at = await walkTo(BOARD_PAPER, 1.6);
  await setView(...aim(at, BOARD_PAPER));
  await page.waitForTimeout(1200);
  await shot("4-board-raw-light");
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
  await shot("5-board-blue-light");
  check("the gel clips over the lens", (await chips()).includes("GEL · FITTED"), await chips());
  check("blue light reveals the phrase", (await tasksText()) === "TASKS 1/5", await tasksText());
  check(
    "the phrase is echoed in the HUD",
    await page.locator("text=YOU GOT THE ANSWER").first().isVisible(),
    null
  );
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
