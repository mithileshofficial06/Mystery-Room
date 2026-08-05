import { CODES } from "./codes";

/**
 * The five locked sections of the Mystery Room, and the codes that open them.
 *
 * THE SHAPE OF THE ROOM. The player walks an antique room looking for clues.
 * Each clue, when solved, spells a word out *in the room* — on paper, on a
 * page, in a web, in a beam of light. The player reads that word and types it
 * into the console under the viewport. A correct word unlocks the matching
 * section in the task rail, and the section then shows its share of the reveal
 * code. Five sections open, and the room hands `CODES.room` to the shell.
 *
 * Sections are opened BY THE CODE, not in order. A team that stumbles on the
 * stags before they ever find the torch can type ANTLERS and open section 4
 * first; nothing gates anything else. That is deliberate — five people crowded
 * round one laptop will not search in the order the author imagined, and a
 * puzzle that insists on an order mostly produces a queue.
 *
 * WHY THE CODES ARE IN THE BUNDLE. For the same reason `CODES.room` is (see
 * codes.ts and spec 2.1): the anti-cheat model is a team typing an answer while
 * a coordinator watches, not hiding strings from a browser that has to render
 * them. Every one of these words is drawn somewhere in the 3D scene, so it is
 * in the bundle whatever this file does. What makes the room worth playing is
 * the work of finding them.
 */
export type SectionId = "s1" | "s2" | "s3" | "s4" | "s5";

export interface RoomSection {
  id: SectionId;
  /** Shown in the task rail, locked or not. Names the place, not the answer. */
  title: string;
  /** One line saying where to look. Never how to solve it. */
  hint: string;
  /** The word the clue spells out in the room. Typing it opens this section. */
  code: string;
}

export const ROOM_SECTIONS: RoomSection[] = [
  {
    id: "s1",
    title: "The case board",
    hint: "Someone wrote on the board in ink that does not answer to lamplight.",
    code: "LANTERN",
  },
  {
    id: "s2",
    title: "The reading cupboards",
    hint: "Every book on that wall opens. Only one of them was worth hiding.",
    code: "GRIMOIRE",
  },
  {
    id: "s3",
    title: "The fluid bench",
    hint: "A shooter, and a rack of cartridges. All but one ran dry years ago.",
    code: "WEBLINE",
  },
  {
    id: "s4",
    title: "The two stags",
    hint: "Two heads on opposite walls, staring each other down. They turn.",
    code: "ANTLERS",
  },
  {
    id: "s5",
    title: "The case items",
    hint: "Four loose things from one case, dropped in four different corners. Each is stamped.",
    code: "INKSTAND",
  },
];

/**
 * Strip a typed answer down to comparable letters.
 *
 * Players type into a console on a projector, in a hall, under time pressure.
 * Case, spaces, hyphens and the stray trailing character a fast typist leaves
 * behind are all noise; rejecting "lantern " as wrong would be a bug wearing a
 * puzzle's clothes. Anything that is not a letter or a digit goes.
 */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The section a typed answer opens, or null if it opens nothing. */
export function matchSection(input: string): RoomSection | null {
  const wanted = normaliseCode(input);
  if (wanted.length === 0) return null;
  return ROOM_SECTIONS.find((s) => normaliseCode(s.code) === wanted) ?? null;
}

/**
 * Split the reveal code into one equal fragment per section.
 *
 * These are NOT read from the server. `/api/hunt/progress` used to ship a
 * `clues` array straight out of the seeded config — `["AR","CH","IV","ES","88"]`
 * — so every client received the whole reveal code, pre-assembled, on page
 * load, before the room was ever opened: `.join("")` was the answer. The leak
 * check in scripts/verify-hunt.ts missed it because it substring-matched the
 * whole code against the served JSON, and the code was fragmented into
 * two-character pieces that never appear as a contiguous match.
 *
 * So this derives the on-face text FROM the already-public constant, in the
 * browser. Nothing about the fragments ever passes through a network response.
 */
export function fragmentsOf(code: string, count: number): string[] {
  if (count <= 0) throw new Error(`Cannot split "${code}" into ${count} fragments`);
  if (code.length % count !== 0) {
    throw new Error(`Reveal code "${code}" does not split evenly into ${count} fragments`);
  }
  const len = code.length / count;
  return Array.from({ length: count }, (_, i) => code.slice(i * len, (i + 1) * len));
}

/** The fragment each section shows once it is open, in rail order. */
export function sectionFragments(): string[] {
  return fragmentsOf(CODES.room, ROOM_SECTIONS.length);
}
