import type { ComponentType } from "react";
import dynamic from "next/dynamic";

/**
 * The puzzle contract (guide §6.1).
 *
 * NOTE: only the Mystery Room is registered so far — the three flat puzzles
 * (§7) have not been extracted yet. Their imports and REGISTRY entries slot in
 * here unchanged when they are.
 */
export interface PuzzleProps {
  config: Record<string, unknown>;
  onSolve: (code: string) => void;
}

export interface HuntPuzzle {
  slug: string;
  title: string;
  Component: ComponentType<PuzzleProps>;
}

/**
 * Only the room loads three.js, and only in the browser. Importing it
 * statically would put a 3D engine in the bundle of a puzzle that is a text
 * box and a slider.
 */
const MysteryRoom = dynamic(() => import("./puzzles/MysteryRoom"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-paper-white/70">Entering the room…</p>,
});

export const REGISTRY: Record<string, HuntPuzzle> = {
  "hunt-room": { slug: "hunt-room", title: "Mystery Room", Component: MysteryRoom },
};
