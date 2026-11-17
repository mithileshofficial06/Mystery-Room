# Mystery Room

A 3D browser escape room built for **XPLORE'26**, a college technical symposium. Teams explore an antique study rendered in real time, find five hidden clues, and unlock a five-part rail that reveals the final code.

![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js_/_React_Three_Fiber-000000?logo=threedotjs&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)

## The puzzle

Five clues are hidden around the room: a case board, a wall of reading cupboards, a fluid bench, two mounted stags and four loose case items. Each one, once solved, spells a word somewhere in the room, developed in ink, printed on a page, written in a web or thrown on the floor in light. Typing that word into the console opens the matching section of the rail.

Sections open by code, not in a fixed order. Five people crowded round one laptop do not search in the order an author imagined, so nothing gates anything else.

## Engineering

- **Real-time 3D** with React Three Fiber and drei, tuned for low draw calls so it runs on venue laptops (`npm run perf` reports draw calls and triangles per frame).
- **End-to-end verification:** `npm run shoot -- --script solve` plays the entire room in a real browser and asserts every step.
- **Puzzle contract lint rules** in ESLint keep each clue's logic self-contained.
- **Unit tests** cover the framework-free logic, such as code normalisation and task state.

## Running it

```bash
npm install
npm run dev -- -p 3100        # http://localhost:3100
```

| Command | Purpose |
|---|---|
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint, including the puzzle-contract rules |
| `npm run shoot` | Screenshot the opening view into `shots/` (dev server must be running) |
| `npm run perf` | Draw calls and triangles per frame |

See [PROGRESS.md](PROGRESS.md) for the full build notes. The answers are deliberately not listed in this README.
