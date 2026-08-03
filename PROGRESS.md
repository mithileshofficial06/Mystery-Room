# Mystery Room — progress

Last updated: 3 August 2026

Section 8 of the XPLORE'26 implementation guide, and only section 8. The guide
describes a four-puzzle hunt (cipher, colour grid, circuit, mystery room) behind
a shared shell with a database and an API; the scope here was narrowed to the
Mystery Room alone. Everything belonging to the other three puzzles has been
removed rather than left lying around half-built — see [Removed](#removed).

---

## Run it

```bash
npm install
npm run dev -- -p 3100     # http://localhost:3100
```

| Command | What it does |
| --- | --- |
| `npm run dev -- -p 3100` | Dev server. The preview page renders the room on its own. |
| `npm test` | Unit tests (framework-free logic only). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint, including the puzzle-contract rules. |
| `npm run shoot` | Screenshot the opening view into `shots/`. |
| `npm run shoot -- --script solve` | Drive the whole puzzle in a real browser and assert 15 things. ~4 minutes. |

`npm run shoot` needs the dev server already running on port 3100.

---

## Where it stands

The room has five tasks. **One of the five is built**; the other four are
placeholders awaiting a spec.

| # | Slot | Kind | State |
| --- | --- | --- | --- |
| p1 | Case folder | `pickup` | Placeholder — click to collect, no mechanic |
| p2 | Deed tin | `pickup` | Placeholder — click to collect, no mechanic |
| p3 | Courier satchel | `pickup` | Placeholder — click to collect, no mechanic |
| p4 | Case board | `board` | **Done** — the torch / blue-gel reveal |
| p5 | Data reel | `pickup` | Placeholder — click to collect, no mechanic |

Completing all five hands `CODES.room` (`ARCHIVES88`) to `onSolve`. Each slot
displays one fifth of it (`AR CH IV ES 88`), split client-side in manifest
order — the fragments never travel over the network.

`kind` on each slot is what decides how a task is completed, so the four
remaining ones can each become their own mechanic without touching the others
or the state machine.

### Built and working

- **A room you walk around.** WASD or arrows to move, drag to look, `R` to
  respawn. AABB push-out collision against furniture footprints; no physics
  engine and no vertical axis, so there is nothing to fall through or get
  launched by.
- **Scenery.** Desk, bookcase, filing cabinets, terminal with a CRT, stove with
  a lit firebox, crates and barrel, steamer trunk, sack barrow, coat stand, step
  ladder, jar shelf, ceiling fan, pendant lamps, pipes, fuse box, window with
  rain. All primitives — no art assets, nothing to download.
- **The torch**, hidden in a recess behind the wall clock. Click the clock and it
  swings aside on its nail; the torch is on a ledge inside. `F` or the red button
  switches it on.
- **The blue gel**, hidden inside a hollowed-out book on top of the filing
  cabinets. Click the book and the cover flips over the spine. `G` or the torch
  head clips the gel over the lens.
- **The case board.** A phrase written in ink that only develops under
  blue-filtered light. Raw torchlight lands on the paper and does nothing, which
  is the point of the puzzle.
- **The desk lamp**, blinking `Welcome to LICET` in Morse, continuously.

### Not built

The four placeholder tasks. Positions live in `ROOM_MANIFEST`; the two tools'
hiding places are the `*_HOME` constants at the top of `MysteryRoomTools.tsx`.

---

## Layout

```
src/
  app/
    page.tsx                  Preview harness. NOT the real event page — it
                              stands in for HuntShell by holding onSolve(code)
                              in local state.
    layout.tsx, globals.css   Design tokens.
    hunt/
      registry.tsx            Puzzle id -> component.
      puzzles/
        MysteryRoom.tsx       Orchestration: state machine, HUD, Canvas.
        MysteryRoomScene.tsx  All non-interactive scenery. Owns OBSTACLES.
        MysteryRoomPlayer.tsx Walk and look. Collision resolution.
        MysteryRoomTools.tsx  Torch, gel, and the two containers hiding them.
                              The only file allowed to hold an onClick.
        MysteryRoomBoard.tsx  The pinboard and the reveal condition.
        MysteryRoomProp.tsx   The four pickup slots.
        MysteryRoomModel.tsx  GLB loader, for swapping in real art later.
        MysteryRoomBoundary.tsx  Error boundary around the Canvas.
  lib/hunt/
    manifest.ts               The five slots. Array order IS code order.
    codes.ts                  Reveal codes, verbatim from guide section 4.1.
    morse.ts + morse.test.ts  Morse encoding for the desk lamp.
scripts/
  shoot-room.mjs              Headless-browser verification harness.
docs/
  XPLORE26-...-guide.pdf      The source guide.
```

The split between `MysteryRoomScene` and everything else is deliberate. Scenery
is the part that gets rearranged over and over; the puzzle state machine is the
part that must not drift. Moving a shelf can never change what counts as solved.

---

## Verification

`npm test` — 15 tests, all on `morse.ts`. Only framework-free logic is unit
tested; there is no value in asserting that a `<mesh>` renders.

`npm run shoot -- --script solve` — drives the room in headless Chromium and
asserts 15 things. All passing:

```
-- Open the wall clock and take the torch from behind it --
  PASS  the wall clock is reachable on foot
  PASS  the wall clock swings aside when clicked
  PASS  opening the clock does not hand over the torch
  PASS  the torch can be taken from the recess
  PASS  the torch switches on
-- Open the book and take the gel, but do not fit it yet --
  PASS  the book is reachable on foot
  PASS  the book opens when clicked
  PASS  opening the book does not hand over the gel
  PASS  the gel can be taken from inside the book
-- The same paper, raw light then blue --
  PASS  raw torchlight lands on the paper and reveals nothing
  PASS  no phrase in the HUD under raw light
  PASS  the gel clips over the lens
  PASS  blue light reveals the phrase
  PASS  the phrase is echoed in the HUD
-- The desk lamp is signalling --
  PASS  the desk lamp blinks rather than sitting still
```

The two board checks run **from the same spot, aimed at the same paper, with the
gel as the only difference between them** — one keypress apart. Walking away to
fetch the gel and coming back would change position, aim and distance all at
once, and a pass would prove nothing about which condition was doing the work.

---

## Things that will bite you

**`reactStrictMode` is off, and has to stay off.** StrictMode double-mounts in
dev. R3F disposes the first `WebGLRenderer` on the unmount, and disposal calls
`forceContextLoss()` on the canvas element — but React reuses that same
`<canvas>` DOM node for the remount, so the second renderer comes up attached to
a deliberately destroyed context. One frame draws, then black, with nothing
thrown and no error boundary fired. See the comment in `next.config.ts`.

**Do not add `transpilePackages: ["three"]`.** It risks a second copy of three
in the bundle, and instanceof checks across two copies fail silently.

**Adding an obstacle footprint is not free.** Every footprint is inflated by the
body radius, so two objects 0.6m apart leave no gap at all, and one laid across a
corridor can seal off a corner of the room — possibly a corner something is
hidden in. The stove and step ladder both had to move for exactly this reason;
neither made anything *strictly* unreachable, which is why only walking the room
found it. The left-hand corridor at `z ≈ 0.5`, between the filing cabinets and
the crates, is the only route to the window end and must stay clear.

**A raycast has no range.** A click lands on whatever the crosshair covers,
however far away. The test harness once "opened" the book from four metres
across the room and passed every check — so it now asserts distance as well as
outcome. Bear this in mind before trusting any new check.

**Puzzles never fetch, and never import `@/lib/hunt/content`.** Both are lint
errors, not conventions. A puzzle renders and calls `onSolve(code)`; the shell is
the only thing that submits.

---

## Removed

Deleted as part of the narrowing to section 8 — all recoverable from git
history if the other puzzles are ever built here:

- `src/lib/hunt/caesar.ts` and `grid.ts` (+ tests) — logic for the cipher and
  colour-grid puzzles. Imported by nothing but their own tests.
- `.env.local.example` — MongoDB and session config for a shell and API that
  do not exist in this repo.
- `seed:coins`, `seed:hunt`, `verify:hunt` scripts — pointed at files that were
  never written.
- `mongodb` and `tsx` dependencies — unused once the above went.

`codes.ts` still carries all four reveal codes. It is verbatim from guide
section 4.1 and trimming it would be a silent change to the spec.

---

## Next

The four undefined tasks. For each one: what the object is, where it hides, and
what the player has to do to get it. The torch/gel/board task is the worked
example of how much mechanic a single slot can carry.
