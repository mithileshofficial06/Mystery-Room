/**
 * The five tasks of the Mystery Room: where each sits, and what each carries.
 *
 * Array order IS the reveal-code order. MysteryRoom.tsx splits CODES.room
 * (@/lib/hunt/codes) into ROOM_MANIFEST.length equal fragments and shows
 * fragment `i` on task `i` — it never assembles the code from the order a
 * player completes them in, only from this fixed order. ROOM.clues in
 * @/lib/hunt/content is a copy of that same split, kept only so a unit test
 * can assert the two never drift apart; it is NOT seeded into the challenge
 * config and nothing at runtime reads it. Keep that lockstep invariant in
 * mind before reordering this array or changing CODES.room's length.
 *
 * `kind` decides how a task is completed, and it is the only thing that
 * decides it:
 *
 *   "pickup"  — find the object and click it. Four of the five.
 *   "board"   — the case board on the right wall, which is not picked up at
 *               all: its fragment appears when the hidden phrase is read
 *               under blue-filtered torchlight (MysteryRoomBoard.tsx).
 *
 * `shape` selects the geometry MysteryRoomProp draws. `model` overrides it
 * with a GLB: point it at a path under public/ and Model
 * (MysteryRoomModel.tsx) loads it instead, with its own Suspense fallback and
 * an error boundary that fails loudly rather than quietly falling back to the
 * primitive. So swapping in real art really is a manifest edit, with no
 * change needed to either component.
 */
export type PropShape = "folder" | "tin" | "satchel" | "tape" | "board";

export interface PropSlot {
  id: string;
  label: string;
  /** How the task is completed. */
  kind: "pickup" | "board";
  /** Primitive geometry to draw when `model` is null. */
  shape: PropShape;
  model: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export const ROOM_MANIFEST: PropSlot[] = [
  {
    id: "p1",
    label: "Case folder",
    kind: "pickup",
    shape: "folder",
    model: null,
    // Resting on the desk top (y = 0.6).
    position: [-2.03, 0.63, -2.88],
    rotation: [0, 0.43, 0],
    scale: 1,
  },
  {
    id: "p2",
    label: "Deed tin",
    kind: "pickup",
    shape: "tin",
    model: null,
    // Second shelf of the bookcase (plank top y = 1.1).
    position: [2.4, 1.19, -2.62],
    rotation: [0, -0.22, 0],
    scale: 1,
  },
  {
    id: "p3",
    label: "Courier satchel",
    kind: "pickup",
    shape: "satchel",
    model: null,
    // On the pallet (top y = 0.1).
    position: [-2.6, 0.23, 1.9],
    rotation: [0, 1.1, 0],
    scale: 1,
  },
  {
    id: "p4",
    label: "Case board",
    kind: "board",
    shape: "board",
    model: null,
    // Right wall. Position is nominal — the board draws itself, see
    // MysteryRoomBoard.tsx.
    position: [5.88, 1.72, -1.0],
    rotation: [0, -Math.PI / 2, 0],
    scale: 1,
  },
  {
    id: "p5",
    label: "Data reel",
    kind: "pickup",
    shape: "tape",
    model: null,
    // On the terminal table (top y = 0.7).
    position: [0.5, 0.75, -3.95],
    rotation: [0, 0.35, 0],
    scale: 1,
  },
];
