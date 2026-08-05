/**
 * Look at the room without a human looking at the room.
 *
 *   npm run dev -- -p 3100
 *   npm run shoot                    # opening view
 *   npm run shoot -- --script solve  # play the whole room, end to end
 *
 * The solve script does the lot: turns both stags over, loads the web shooter,
 * opens the wall clock for the torch, finds the one book on the wall that is
 * shelved upside down, opens the hollowed book for the blue gel, develops the
 * case board under blue light, collects the four loose case items, and types
 * every word it reads into the console — finishing by checking that five open
 * sections hand ARCHIVES88 up to the shell. It takes a while; it walks the
 * whole room to do it.
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

/**
 * The four other clues.
 *
 * Every one of these is a CLICK TARGET, not the visible object. Most of the
 * clickable things in this room hide behind an invisible box a few centimetres
 * proud of the model, because the models are small and this is played on a
 * trackpad — and aiming at the model behind the box sends the ray through a
 * neighbour's box instead. That is how this route once opened the wrong book
 * and reported that it had found the right one.
 */
const STAG_LEFT = [-5.486, 2.676, 3.3];
const STAG_RIGHT = [5.486, 2.676, 3.3];
/** Where the stags' beams cross on the boards. */
const STAG_WORD = [0, 0.03, 2.35];
/** The full cartridge, and one of the seven spent ones beside it. */
const CARTRIDGE_FULL = [-0.97, 1.005, 4.2];
const CARTRIDGE_SPENT = [-0.79, 1.005, 4.02];
/** The web the shooter throws across the bench. */
const WEB = [-1.76, 0.93, 3.96];
/**
 * The one book on the wall that is shelved upside down, and a decoy in the
 * same bay.
 *
 * Same bay deliberately. The bays are divided by full-height partitions, so a
 * shot taken from two bays along goes into the side of a partition — correct
 * behaviour, and it means the route has to stand square in front of the bay
 * rather than scanning the run from one spot.
 */
const BOOK_RIGHT = [5.66, 1.137, -4.2];
const BOOK_DECOY = [5.66, 1.746, -4.315];

/**
 * The four loose case items, from ROOM_MANIFEST, and where to stand for each.
 *
 * Every one of them sits ON a piece of furniture, so the closest a body can get
 * is that furniture's inflated footprint — a shelf, a desk top and a pallet all
 * hold their contents a good arm's length back. The stand-here points are those
 * boundaries, not a guess.
 */
const ITEMS = [
  { name: "data reel", at: [0.5, 0.75, -3.95], from: [0.5, -3.15] },
  { name: "deed tin", at: [2.4, 1.19, -2.62], from: [2.4, -2.0] },
  { name: "case folder", at: [-2.03, 0.63, -2.88], from: [-2.0, -1.8] },
  { name: "courier satchel", at: [-2.6, 0.23, 1.9], from: [-2.6, 0.8] },
];

/** The words each clue spells out. Must match ROOM_SECTIONS in roomTasks.ts. */
const WORDS = {
  board: "LANTERN",
  books: "GRIMOIRE",
  bench: "WEBLINE",
  stags: "ANTLERS",
  items: "INKSTAND",
};

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
  const [wantYaw, wantPitch] = aim(at, target);
  let offBy = wantYaw - at.yaw;
  while (offBy > Math.PI) offBy -= Math.PI * 2;
  while (offBy < -Math.PI) offBy += Math.PI * 2;
  // Skip the re-aim when already on target. A zero-length drag is a mousedown
  // and a mouseup at the same point, which the browser dispatches as a click —
  // so re-aiming at something already under the crosshair fired TWICE, and a
  // stag that turns a quarter turn per click turned three times per call.
  if (Math.abs(offBy) > 0.015 || Math.abs(wantPitch - at.pitch) > 0.015) {
    await setView(wantYaw, wantPitch);
  }
  await page.waitForTimeout(150);
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(settle);
  return distanceTo(at, target);
}

/** Arm's reach, near enough. Anything further is the route cheating. */
const REACH = 2.0;
/**
 * Except for the two stags, which hang on opposite walls above head height and
 * are meant to be worked from anywhere in the room they can be seen from.
 */
const STAG_REACH = 7.0;

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
const sectionsText = async () =>
  (await page.locator("text=/SECTIONS \\d+\\/\\d+/").first().textContent()).trim();
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

/** The transient feedback line under the viewport, or "" if none is showing. */
async function note() {
  const line = page.locator("p.max-w-\\[46rem\\]");
  return (await line.count()) ? ((await line.first().textContent()) ?? "").trim() : "";
}

/**
 * Poll the feedback line until it says this, or give up and return whatever it
 * last said.
 *
 * Sampling it once after a fixed delay does not work. Several of these
 * sequences run on their own timers — a book takes two seconds to riffle, the
 * shooter most of a second to charge — and a line only stays up for five, so a
 * single sample can land either side of the message. Worse, a page screenshot
 * under SwiftShader can itself take longer than five seconds, so a check placed
 * after one was reading a blank line and calling it a missing message.
 */
async function waitForNote(pattern, ms = 7000) {
  const until = Date.now() + ms;
  for (;;) {
    const text = await note();
    if (pattern.test(text)) return text;
    if (Date.now() >= until) return text;
    await page.waitForTimeout(200);
  }
}

/**
 * Type a word into the console at the bottom of the viewport and submit it.
 *
 * This is the step every clue in the room ends at: the room never opens a
 * section by itself, it only ever puts a word somewhere the player can read it.
 */
async function enterCode(word) {
  const box = page.locator('input[aria-label="Code entry"]');
  await box.click();
  await box.fill(word);
  await box.press("Enter");
  await page.waitForTimeout(500);
}

if (script === "solve") {
  console.log("\n-- The two stags, from where the player starts --");
  check("no section is open to begin with", (await sectionsText()) === "SECTIONS 0/5", await sectionsText());
  const stagRange = await lookAndClick(STAG_LEFT, 300);
  check("a stag can be worked from across the room", stagRange <= STAG_REACH, `${stagRange.toFixed(2)}m`);
  check(
    "clicking a stag turns it",
    /turns on its mount/.test(await waitForNote(/turns on its mount/)),
    await note()
  );
  await lookAndClick(STAG_LEFT, 300);
  // One stag over is not the answer. If it were, the pair would be decoration.
  check(
    "one stag alone reveals nothing",
    /still the right way up/.test(await waitForNote(/still the right way up/)),
    await note()
  );
  check("and opens no section", (await sectionsText()) === "SECTIONS 0/5", await sectionsText());
  await shot("1-one-stag-over");

  await lookAndClick(STAG_RIGHT, 300);
  await lookAndClick(STAG_RIGHT, 300);
  const stagsSaid = await waitForNote(new RegExp(`spell it out: ${WORDS.stags}`));
  check("both stags over crosses the beams", new RegExp(WORDS.stags).test(stagsSaid), stagsSaid);
  const stagView = await walkTo([STAG_WORD[0], 0, STAG_WORD[2] + 1.7], 0.5, 8);
  await setView(...aim(stagView, STAG_WORD));
  await page.waitForTimeout(800);
  await shot("2-stag-word");

  console.log("\n-- The console at the bottom of the viewport --");
  await enterCode("NOPE");
  check(
    "a word that is not in this room is refused",
    /Nothing in this room answers to that/.test(await waitForNote(/Nothing in this room answers to that/, 2000)),
    await note()
  );
  check("and opens nothing", (await sectionsText()) === "SECTIONS 0/5", await sectionsText());
  await enterCode(WORDS.stags.toLowerCase());
  check("the stag word opens its section", (await sectionsText()) === "SECTIONS 1/5", await sectionsText());
  // Case and spacing are noise. Rejecting "antlers" would be a bug wearing a
  // puzzle's clothes.
  check("case is not part of the answer", (await sectionsText()) === "SECTIONS 1/5", await sectionsText());

  // Typing must not leave the room unresponsive to the keys that drive it.
  const beforeKeys = await state();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  const afterKeys = await state();
  check(
    "the movement keys still work after typing in the console",
    Math.hypot(afterKeys.x - beforeKeys.x, afterKeys.z - beforeKeys.z) > 0.2,
    null
  );

  console.log("\n-- The fluid bench, behind the spawn point --");
  await walkTo([CARTRIDGE_SPENT[0], 0, 3.4], 0.5, 12);
  const spentRange = await lookAndClick(CARTRIDGE_SPENT, 300);
  check("the cartridge rack is reachable on foot", spentRange <= REACH, `${spentRange.toFixed(2)}m`);
  check(
    "a spent cartridge crumbles and is gone",
    /crumbles to nothing/.test(await waitForNote(/crumbles to nothing/)),
    await note()
  );
  const fullRange = await lookAndClick(CARTRIDGE_FULL, 200);
  check("the full cartridge is reachable on foot", fullRange <= REACH, `${fullRange.toFixed(2)}m`);
  // Loading the shooter and firing it are separate. If the click fired it, the
  // charge would be scenery.
  check(
    "the full cartridge seats in the shooter",
    /seats in the shooter/.test(await waitForNote(/seats in the shooter/, 700)),
    await note()
  );
  const webSaid = await waitForNote(new RegExp(`with a word in it: ${WORDS.bench}`));
  check("the shooter then throws a web with a word in it", new RegExp(WORDS.bench).test(webSaid), webSaid);
  const webView = await state();
  await setView(...aim(webView, WEB));
  await page.waitForTimeout(700);
  await shot("3-web");
  await enterCode(WORDS.bench);
  check("the web word opens its section", (await sectionsText()) === "SECTIONS 2/5", await sectionsText());

  console.log("\n-- Open the wall clock and take the torch from behind it --");
  // Down the right-hand side of the room, then west along the lane between
  // the terminal table and the step ladder. These are the gaps between the
  // inflated footprints in OBSTACLES, not a guess.
  await route([[0.5, 3.0], [3.5, 1.5], [4.5, -0.5], [4.5, -2.5], [4.3, -4.0], [2.5, -4.2]], CLOCK, 1.0);
  await shot("4-clock");
  const clockRange = await lookAndClick(CLOCK, 900);
  check("the wall clock is reachable on foot", clockRange <= REACH, `${clockRange.toFixed(2)}m`);
  check(
    "the wall clock swings aside when clicked",
    /recess cut into the wall/.test(await waitForNote(/recess cut into the wall/)),
    await note()
  );

  // Opening a container and taking what is inside it are two different
  // things. If the clock handed over the torch, the recess would be scenery.
  check(
    "opening the clock does not hand over the torch",
    (await chips()).includes("TORCH · ?"),
    await chips()
  );
  await shot("5-recess");

  await lookAndClick(TORCH);
  check("the torch can be taken from the recess", (await chips()).includes("TORCH · OFF"), await chips());

  await page.keyboard.press("f");
  await page.waitForTimeout(500);
  await setView((await state()).yaw, -0.15);
  await shot("6-torch-on");
  check("the torch switches on", (await chips()).includes("TORCH · ON"), await chips());

  console.log("\n-- The reading cupboards, thirty books and one of them upside down --");
  // Square in front of the back bay. See the note on BOOK_DECOY.
  await route([[4.3, -4.0], [4.6, -3.4]], [4.5, 0, -4.2], 0.45);
  const decoyRange = await lookAndClick(BOOK_DECOY, 500);
  check("a book on the wall is reachable on foot", decoyRange <= 2.5, `${decoyRange.toFixed(2)}m`);
  check(
    "the wrong book says so and puts itself back",
    /not the book you are searching for/.test(await waitForNote(/not the book you are searching for/)),
    await note()
  );
  await shot("7-wrong-book");
  check("and opens no section", (await sectionsText()) === "SECTIONS 2/5", await sectionsText());
  // A pulled book will not let a second one be pulled until it is back on the
  // shelf: opening, reading and closing come to about three and a half seconds.
  await page.waitForTimeout(4000);

  const rightRange = await lookAndClick(BOOK_RIGHT, 400);
  check("the upside-down book is reachable on foot", rightRange <= 2.5, `${rightRange.toFixed(2)}m`);
  const bookSaid = await waitForNote(new RegExp(`settle on one word: ${WORDS.books}`));
  check("the right book riffles through to a word", new RegExp(WORDS.books).test(bookSaid), bookSaid);
  await shot("8-right-book");
  await enterCode(WORDS.books);
  check("the book word opens its section", (await sectionsText()) === "SECTIONS 3/5", await sectionsText());

  console.log("\n-- Open the book on the cabinets and take the gel, but do not fit it yet --");
  await route(
    [[4.6, -3.4], [4.5, -2.5], [4.5, -0.5], [0, -0.6], [-3.5, -0.6], [-3.5, -1.7]],
    [BOOK[0], 0, BOOK[2]],
    1.35
  );
  await shot("9-hollow-book");
  const bookRange = await lookAndClick(BOOK, 900);
  check("the hollowed book is reachable on foot", bookRange <= REACH, `${bookRange.toFixed(2)}m`);
  check(
    "it opens when clicked",
    /pages have been cut away/.test(await waitForNote(/pages have been cut away/)),
    await note()
  );
  check("opening it does not hand over the gel", (await chips()).includes("GEL · ?"), await chips());
  await shot("10-hollow-book-open");

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
  await shot("11-board-raw-light");
  check(
    "raw torchlight lands on the paper and develops nothing",
    !(await page.locator(`text=${WORDS.board}`).first().isVisible()),
    await note()
  );

  // One keypress. Nothing else changes — not position, not aim, not distance.
  await page.keyboard.press("g");
  check("the gel clips over the lens", (await chips()).includes("GEL · FITTED"), await chips());
  const boardSaid = await waitForNote(new RegExp(`develops under the blue beam: ${WORDS.board}`));
  check("blue light develops the ink", new RegExp(WORDS.board).test(boardSaid), boardSaid);
  // The screenshot comes AFTER the check, not before it. A page screenshot
  // under SwiftShader can take longer than the five seconds a feedback line
  // stays up, so a check placed after one reads a blank line and calls it a
  // message that never arrived.
  await shot("12-board-blue-light");
  await enterCode(WORDS.board);
  check("the board word opens its section", (await sectionsText()) === "SECTIONS 4/5", await sectionsText());

  console.log("\n-- The four loose case items --");
  let collected = 0;
  for (const item of ITEMS) {
    await walkTo([item.from[0], 0, item.from[1]], 0.55, 22);
    const range = await lookAndClick(item.at, 400);
    const said = await waitForNote(/Case item recovered|letters stamped on their faces/);
    const got = /Case item recovered|letters stamped on their faces/.test(said);
    if (got) collected += 1;
    check(`the ${item.name} can be picked up`, got && range <= REACH, `${range.toFixed(2)}m ${JSON.stringify(said)}`);
  }
  check("all four were recovered", collected === ITEMS.length, collected);
  // The four faces only read as a word once all four are in hand, and the HUD
  // shows them in manifest order rather than the order they were found.
  const faces = page.locator("text=/^IN KS TA ND$/");
  check("the four faces spell the word out in order", await faces.first().isVisible(), null);
  await shot("13-case-items");
  await enterCode(WORDS.items);
  check("the item word opens the last section", (await sectionsText()) === "SECTIONS 5/5", await sectionsText());

  // The whole point of the room: five sections open hands the reveal code to
  // the shell. The preview page holds it in the box under the viewport.
  const handedUp = await page.locator('input[placeholder="Enter the code"]').inputValue();
  check("a full set of sections hands ARCHIVES88 up to the shell", handedUp === "ARCHIVES88", handedUp);

  console.log("\n-- The desk lamp is signalling --");
  const lampAt = await route([[-2.6, 0.55], [-2.0, -1.7], [0, -2.0]], [-0.2, 0, -3.0], 0.5);
  await setView(...aim(lampAt, LAMP));
  // Switch the torch off first: a lit beam pointed at the desk washes the
  // lamp out and the difference between its two states goes with it.
  await page.keyboard.press("f");
  await page.waitForTimeout(600);
  await shot("14-lamp");
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
