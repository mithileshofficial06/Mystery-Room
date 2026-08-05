# Mystery Room — progress

Last updated: 5 August 2026

Section 8 of the XPLORE'26 implementation guide, and only section 8. The guide
describes a four-puzzle hunt (cipher, colour grid, circuit, mystery room) behind
a shared shell with a database and an API; the scope here was narrowed to the
Mystery Room alone. Everything belonging to the other three puzzles has been
removed rather than left lying around half-built — see [Removed](#removed).

---

## The room

An antique room. Five clues are hidden in it. Down the right-hand side is a rail
of five locked sections, and along the bottom is a console.

Every clue, once solved, spells a **word out in the room** — developed on paper,
printed on a page, written in a web, thrown on the floorboards in light. The
player reads that word, types it into the console, and the matching section
opens and shows its share of the reveal code. Five sections open and the room
hands `ARCHIVES88` up to the shell.

Sections are opened **by the code, not in order**. Nothing gates anything else.
Five people crowded round one laptop do not search in the order an author
imagined, and a puzzle that insists on an order mostly produces a queue.

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
| `npm run shoot -- --script solve` | Play the entire room in a real browser and assert 45 things. ~12 minutes. |

`npm run shoot` needs the dev server already running on port 3100. Pass
`--url http://localhost:3000/` to point it somewhere else.

---

## The five clues

All five are built and all five are verified end to end.

| # | Section | Word | How the word is revealed |
| --- | --- | --- | --- |
| 1 | The case board | `LANTERN` | Ink on a pinned sheet that only develops under blue-filtered torchlight. |
| 2 | The reading cupboards | `GRIMOIRE` | Thirty books on the right wall, all pullable. The wrong ones open, say so, and put themselves back. The right one riffles through to a word. |
| 3 | The fluid bench | `WEBLINE` | Eight cartridges, one still full. Load the shooter and it puts a web across the bench with a word in it. |
| 4 | The two stags | `ANTLERS` | Two mounted heads on opposite walls. Turn **both** upside down and their eyes throw beams that cross on the floor. |
| 5 | The case items | `INKSTAND` | Four loose objects in four corners, two letters stamped on each face. |

The rail shows each section's fragment once it is open: `AR CH IV ES 88`, split
client-side in rail order. The fragments never travel over the network.

### The tools

Neither is a task. They exist to make clue 1 solvable, and each is inside a
container that has to be opened first — opening the container and taking what is
inside it are separate acts, and the harness asserts they stay separate.

- **The torch**, in a recess behind the wall clock on the back wall. Click the
  clock and it swings aside on its nail. `F` switches the torch on.
- **The blue gel**, inside a hollowed-out book on top of the filing cabinets,
  wedged between two boxes of files with its top face at eye height. `G` clips
  it over the lens.

### Two decisions worth knowing about

**The torch and the gel are not under a drawer.** The room concept put them
there; a later instruction moved them to the wall clock and the hollow book, and
that is where they are. What survived from the drawer idea is that **all twelve
drawers in the room open when clicked** — three in the desk, nine in the filing
cabinets — and none of them hides anything. That is the point of building all
twelve: "some scenery is openable" is only a rule a player can reason about
after they have opened a dozen ordinary drawers and found ordinary drawer
contents. The twelve dead ends are what turn the clock into a deduction rather
than a lucky click. Say the word and the tools can move back into a drawer.

**Section 5 was not specified.** Four clues were described and the rail has five
slots, so the fifth is an invention: four loose case items scattered through the
room, each stamped with two letters. It reuses the props that were already in
`ROOM_MANIFEST` and it is the one section that can be replaced without touching
anything else.

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
        MysteryRoom.tsx       Orchestration: section state, the task rail, the
                              console, the Canvas.
        MysteryRoomScene.tsx  All non-interactive scenery. Owns OBSTACLES.
        MysteryRoomPlayer.tsx Walk and look. Collision resolution.
        MysteryRoomTools.tsx  Torch, gel, and the two containers hiding them.
        MysteryRoomDrawers.tsx  The twelve openable drawers.
        MysteryRoomBooks.tsx  Clue 2: the reading cupboards.
        MysteryRoomWebBench.tsx  Clue 3: the shooter and the cartridge rack.
        MysteryRoomDeer.tsx   Clue 4: the two stags and their beams.
        MysteryRoomBoard.tsx  Clue 1: the pinboard and the reveal condition.
        MysteryRoomProp.tsx   Clue 5: the four loose case items.
        MysteryRoomModel.tsx  GLB loader, for swapping in real art later.
        MysteryRoomBoundary.tsx  Error boundary around the Canvas.
  lib/hunt/
    manifest.ts               The four case items. Array order IS letter order.
    codes.ts                  Reveal codes, verbatim from guide section 4.1.
    roomTasks.ts + test       The five sections, their words, code matching.
    morse.ts + test           Morse encoding for the desk lamp.
scripts/
  shoot-room.mjs              Headless-browser verification harness.
docs/
  XPLORE26-...-guide.pdf      The source guide.
```

`MysteryRoomScene.tsx` holds **nothing with an `onClick`**. That is what makes
"clicking a filing cabinet does nothing" a property of the code rather than
something to remember. Every interactive thing lives in its own file beside it,
and the two that share coordinates with scenery — the drawers — import the
anchor constants rather than repeating them.

Scenery is the part that gets rearranged over and over; the section state
machine is the part that must not drift. Moving a shelf can never change what
counts as solved.

---

## Verification

`npm test` — 35 tests across `morse.ts` and `roomTasks.ts`. Only framework-free
logic is unit tested; there is no value in asserting that a `<mesh>` renders.

`npm run shoot -- --script solve` — plays the whole room in headless Chromium
and asserts 45 things. All passing:

```
-- The two stags, from where the player starts --
  PASS  no section is open to begin with
  PASS  a stag can be worked from across the room
  PASS  clicking a stag turns it
  PASS  one stag alone reveals nothing
  PASS  and opens no section
  PASS  both stags over crosses the beams
-- The console at the bottom of the viewport --
  PASS  a word that is not in this room is refused
  PASS  and opens nothing
  PASS  the stag word opens its section
  PASS  case is not part of the answer
  PASS  the movement keys still work after typing in the console
-- The fluid bench, behind the spawn point --
  PASS  the cartridge rack is reachable on foot
  PASS  a spent cartridge crumbles and is gone
  PASS  the full cartridge is reachable on foot
  PASS  the full cartridge seats in the shooter
  PASS  the shooter then throws a web with a word in it
  PASS  the web word opens its section
-- Open the wall clock and take the torch from behind it --
  PASS  the wall clock is reachable on foot
  PASS  the wall clock swings aside when clicked
  PASS  opening the clock does not hand over the torch
  PASS  the torch can be taken from the recess
  PASS  the torch switches on
-- The reading cupboards, thirty books and one of them upside down --
  PASS  a book on the wall is reachable on foot
  PASS  the wrong book says so and puts itself back
  PASS  and opens no section
  PASS  the upside-down book is reachable on foot
  PASS  the right book riffles through to a word
  PASS  the book word opens its section
-- Open the book on the cabinets and take the gel, but do not fit it yet --
  PASS  the hollowed book is reachable on foot
  PASS  it opens when clicked
  PASS  opening it does not hand over the gel
  PASS  the gel can be taken from inside the book
-- The same paper, raw light then blue --
  PASS  raw torchlight lands on the paper and develops nothing
  PASS  the gel clips over the lens
  PASS  blue light develops the ink
  PASS  the board word opens its section
-- The four loose case items --
  PASS  the data reel can be picked up
  PASS  the deed tin can be picked up
  PASS  the case folder can be picked up
  PASS  the courier satchel can be picked up
  PASS  all four were recovered
  PASS  the four faces spell the word out in order
  PASS  the item word opens the last section
  PASS  a full set of sections hands ARCHIVES88 up to the shell
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
however far away. The harness once "opened" the book from four metres across the
room and passed every check — so it now asserts distance as well as outcome.
Bear this in mind before trusting any new check.

**A callback passed inline into a component that uses it as an effect
dependency is a fresh function every render.** The stags' "solved" effect was
written that way and re-ran on every render of the room, calling `onFound` again
and resetting the feedback line to its own message — so every other message in
the room appeared for one render and was then overwritten, which looked exactly
like all the other clues had stopped working. The section callbacks in
`MysteryRoom.tsx` are `useCallback`-stable and the stag report is latched behind
a ref. Both, not either.

**Never call `setState` from inside another `setState` updater.** Updaters run
during React's render pass and React is free to run them more than once. Three
handlers did this and had to be rewritten to work the next value out first.

**A held object must not sit on the crosshair.** It is clickable — that is how
you put it down — so held dead centre it swallowed every click aimed at anything
else, and the second, third and fourth case items simply could not be picked up.
It is held to the left now, the way the torch is held to the right.

**Every key handler in the room listens on `window`**, because a control that
only works while the canvas happens to hold focus stops working the first time
anybody clicks anything. The cost is `isTypingTarget` in
`MysteryRoomPlayer.tsx`: the console is a real text input, and without that
guard typing a word would walk the player across the room and strobe the torch
while they did it. Every handler must use it, or the guard is worse than none.

**Small clickable things need an invisible box around them.** This is played on
a trackpad by somebody standing at the back of a hall looking at a projector. A
6cm book spine seen edge-on from a metre away is a couple of dozen pixels.

**The reading cupboards have full-height partitions between bays**, so a shot
taken from two bays along goes into the side of a partition. That is correct —
it means the run has to be walked rather than scanned from one spot — but it
will look like a broken click target if you forget.

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

- Section 5 is a stand-in (see above). If it should be something else, it is the
  one section that can be swapped without touching the other four.
- The reveal is still a word on a page. If a team should have to *combine* two
  clues to get a word, the console already accepts anything — nothing about the
  section machinery would need to change.
- Real art. Every object in the room is primitives. `model` on a manifest slot
  points at a GLB under `public/` and `MysteryRoomModel` loads it instead.
