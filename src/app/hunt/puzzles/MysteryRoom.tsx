"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ROOM_MANIFEST } from "@/lib/hunt/manifest";
import { CODES } from "@/lib/hunt/codes";
import Player, { type PlayerState } from "./MysteryRoomPlayer";
import Prop from "./MysteryRoomProp";
import RoomScene from "./MysteryRoomScene";
import Board from "./MysteryRoomBoard";
import RoomBoundary from "./MysteryRoomBoundary";
import { FilmPickup, HeldTorch, HiddenBook, TorchPickup, WallClock } from "./MysteryRoomTools";
import type { PuzzleProps } from "../registry";

/**
 * The phrase written on the case board in ink that only develops under blue
 * light.
 *
 * It is a confirmation, not the answer — reading it completes one of the five
 * tasks and hands over that task's code fragment. The reveal code itself is
 * never written on the board, because the board is rendered from client state
 * and anything drawn there is in the bundle either way; what makes this worth
 * doing is the mechanic, not the secrecy.
 */
const BOARD_PHRASE = "YOU GOT THE ANSWER";

/**
 * The five on-face fragments, purely for display.
 *
 * These are NOT read from the server. `/api/hunt/progress` used to ship a
 * `clues` array straight out of the seeded config —
 * `["AR","CH","IV","ES","88"]` — and every client received the whole reveal
 * code, pre-assembled, on page load, before the room was ever opened:
 * `.join("")` was the answer. The leak check in scripts/verify-hunt.ts missed
 * it because it substring-matches the whole code against the served JSON, and
 * the code was fragmented into two-character pieces that never appear as a
 * contiguous match.
 *
 * CODES.room is client-safe by design (see codes.ts and spec §2.1) — the
 * anti-cheat model is a team typing the code while a coordinator watches, not
 * hiding it from the bundle. So this derives the on-face text FROM that
 * already-public constant, in the browser, splitting it into
 * ROOM_MANIFEST.length equal pieces in manifest order. Nothing about the
 * fragments ever passes through a network response.
 */
function fragmentsOf(code: string, count: number): string[] {
  if (code.length % count !== 0) {
    throw new Error(`Reveal code "${code}" does not split evenly into ${count} fragments`);
  }
  const len = code.length / count;
  return Array.from({ length: count }, (_, i) => code.slice(i * len, (i + 1) * len));
}

export default function MysteryRoom({ onSolve }: PuzzleProps) {
  const clues = useMemo(() => fragmentsOf(CODES.room, ROOM_MANIFEST.length), []);
  const [held, setHeld] = useState<string | null>(null);
  const [found, setFound] = useState<string[]>([]);

  // Tools. Neither is a task — they are what makes the board task solvable.
  // Each is inside a container that has to be opened first, so the two
  // `*Open` flags gate whether the pickup exists in the scene at all rather
  // than merely hiding it: a pickup that is only invisible is still there to
  // be clicked through.
  const [clockOpen, setClockOpen] = useState(false);
  const [torchTaken, setTorchTaken] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [filmTaken, setFilmTaken] = useState(false);
  const [filmOn, setFilmOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Shared between Player and every clickable — see Player's doc comment.
  const dragRef = useRef<PlayerState>({ moved: false });

  const complete = found.length === ROOM_MANIFEST.length;

  // In an effect, not during render: calling the parent's setState from a
  // render body is a React error, and it would fire on every pick. What goes
  // up is always the CODES.room constant, never anything reconstructed from
  // per-task state.
  useEffect(() => {
    if (complete) onSolve(CODES.room);
  }, [complete, onSolve]);

  /** Transient line of text under the viewport. Every interaction says something. */
  const say = useCallback((text: string) => setNote(text), []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3600);
    return () => clearTimeout(t);
  }, [note]);

  const markFound = useCallback((id: string) => {
    setFound((f) => (f.includes(id) ? f : [...f, id]));
  }, []);

  function pick(id: string) {
    setHeld((h) => (h === id ? null : id));
    markFound(id);
  }

  const toggleTorch = useCallback(() => {
    if (!torchTaken) return;
    setTorchOn((on) => {
      say(on ? "Torch off." : "Torch on.");
      return !on;
    });
  }, [torchTaken, say]);

  const attachFilm = useCallback(() => {
    if (!filmTaken || filmOn) return;
    setFilmOn(true);
    say("Blue gel clipped over the lens. The beam turns blue.");
  }, [filmTaken, filmOn, say]);

  // Keyboard equivalents for the two torch actions. The button on the model
  // is 3cm across and held at the edge of the view; on a trackpad, in a hall,
  // a key is the difference between playable and fiddly.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "f") toggleTorch();
      if (k === "g") attachFilm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTorch, attachFilm]);

  const boardSlotIndex = ROOM_MANIFEST.findIndex((s) => s.kind === "board");
  const boardSlot = boardSlotIndex === -1 ? null : ROOM_MANIFEST[boardSlotIndex];
  const boardSolved = boardSlot ? found.includes(boardSlot.id) : false;

  return (
    <div>
      <div className="panel relative h-[620px] w-full overflow-hidden">
        <RoomBoundary>
        <Canvas shadows camera={{ fov: 55, position: [0, 1.62, 3.2] }}>
          <color attach="background" args={["#0b0e14"]} />
          <fogExp2 attach="fog" args={["#141a24", 0.014]} />

          <Player dragRef={dragRef} />
          <RoomScene />

          {/* Tools, each behind something that has to be opened first */}
          <WallClock
            open={clockOpen}
            dragRef={dragRef}
            onOpen={() => {
              setClockOpen(true);
              say("The clock swings aside. There is a recess cut into the wall behind it.");
            }}
          />
          {clockOpen && !torchTaken && (
            <TorchPickup
              dragRef={dragRef}
              onPick={() => {
                setTorchTaken(true);
                say("Picked up a torch. Click its red button, or press F, to switch it on.");
              }}
            />
          )}

          <HiddenBook
            open={bookOpen}
            dragRef={dragRef}
            onOpen={() => {
              setBookOpen(true);
              say("The book falls open. Its pages have been cut away around something.");
            }}
          />
          {bookOpen && !filmTaken && (
            <FilmPickup
              dragRef={dragRef}
              onPick={() => {
                setFilmTaken(true);
                say("Picked up a blue gel filter. Click the torch head, or press G, to clip it on.");
              }}
            />
          )}
          {torchTaken && (
            <HeldTorch
              on={torchOn}
              film={filmOn}
              hasFilm={filmTaken}
              dragRef={dragRef}
              onToggle={toggleTorch}
              onAttachFilm={attachFilm}
            />
          )}

          {/* The five tasks */}
          {ROOM_MANIFEST.map((slot, i) =>
            slot.kind === "board" ? null : (
              <Prop
                key={slot.id}
                slot={slot}
                clue={clues[i] ?? "?"}
                held={held === slot.id}
                found={found.includes(slot.id)}
                onPick={() => pick(slot.id)}
                dragRef={dragRef}
              />
            )
          )}

          {boardSlot && (
            <Board
              phrase={BOARD_PHRASE}
              torchOn={torchOn}
              filmOn={filmOn}
              solved={boardSolved}
              onReveal={() => {
                markFound(boardSlot.id);
                say(`The paper reads: ${BOARD_PHRASE} — fragment ${clues[boardSlotIndex]} recovered.`);
              }}
            />
          )}
        </Canvas>
        </RoomBoundary>

        <Hud
          found={found.length}
          total={ROOM_MANIFEST.length}
          torchTaken={torchTaken}
          torchOn={torchOn}
          filmTaken={filmTaken}
          filmOn={filmOn}
          boardSolved={boardSolved}
          phrase={BOARD_PHRASE}
          note={note}
        />
      </div>

      <p className="mt-3 text-sm text-paper-white/70">
        <strong className="text-paper-white">WASD</strong> or arrow keys to walk,{" "}
        <strong className="text-paper-white">drag</strong> to look,{" "}
        <strong className="text-paper-white">click</strong> to pick things up,{" "}
        <strong className="text-paper-white">R</strong> to return to the door. Found {found.length} of{" "}
        {ROOM_MANIFEST.length}.
      </p>
    </div>
  );
}

interface HudProps {
  found: number;
  total: number;
  torchTaken: boolean;
  torchOn: boolean;
  filmTaken: boolean;
  filmOn: boolean;
  boardSolved: boolean;
  phrase: string;
  note: string | null;
}

/**
 * The 2D overlay: progress, what is in hand, and one line of feedback.
 *
 * The revealed phrase is repeated here rather than living only on the board.
 * The 3D text is drawn by troika, which fetches its default font over the
 * network — on a locked-down event wifi that can fail silently, and a puzzle
 * whose entire payoff is a line of text must not have a single point of
 * failure that renders nothing and says nothing.
 */
function Hud({ found, total, torchTaken, torchOn, filmTaken, filmOn, boardSolved, phrase, note }: HudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded bg-black/55 px-3 py-1.5 font-mono text-xs tracking-widest text-paper-white/85 backdrop-blur-sm">
          TASKS {found}/{total}
        </div>
        <div className="flex gap-2">
          <Chip active={torchTaken} label={torchTaken ? (torchOn ? "TORCH · ON" : "TORCH · OFF") : "TORCH · ?"} />
          <Chip active={filmTaken} label={filmTaken ? (filmOn ? "GEL · FITTED" : "GEL · LOOSE") : "GEL · ?"} />
        </div>
      </div>

      {/* Crosshair — with a walkable camera, a fixed centre point is what makes
          aiming the beam at a specific sheet of paper possible at all. */}
      <div className="mx-auto h-1.5 w-1.5 rounded-full bg-paper-white/45" />

      <div className="space-y-2">
        {boardSolved && (
          <p className="mx-auto w-fit rounded border border-[#3f7bff] bg-[#0a1836]/85 px-4 py-2 font-mono text-sm tracking-[0.2em] text-[#bfe0ff] backdrop-blur-sm">
            {phrase}
          </p>
        )}
        {note && (
          <p className="mx-auto w-fit rounded bg-black/65 px-3 py-1.5 text-sm text-paper-white/90 backdrop-blur-sm">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

function Chip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-1 font-mono text-[0.65rem] tracking-widest backdrop-blur-sm ${
        active ? "bg-[#0a1836]/80 text-[#9fc6ff]" : "bg-black/50 text-paper-white/40"
      }`}
    >
      {label}
    </span>
  );
}
