"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ROOM_MANIFEST } from "@/lib/hunt/manifest";
import { CODES } from "@/lib/hunt/codes";
import {
  ROOM_SECTIONS,
  fragmentsOf,
  matchSection,
  sectionFragments,
  type SectionId,
} from "@/lib/hunt/roomTasks";
import Player, { isTypingTarget, type PlayerState } from "./MysteryRoomPlayer";
import Prop from "./MysteryRoomProp";
import RoomScene from "./MysteryRoomScene";
import Board from "./MysteryRoomBoard";
import Books from "./MysteryRoomBooks";
import Deer from "./MysteryRoomDeer";
import Drawers from "./MysteryRoomDrawers";
import WebBench from "./MysteryRoomWebBench";
import RoomBoundary from "./MysteryRoomBoundary";
import { FilmPickup, HeldTorch, HiddenBook, TorchPickup, WallClock } from "./MysteryRoomTools";
import type { PuzzleProps } from "../registry";

/**
 * The Mystery Room.
 *
 * An antique room with five clues hidden in it, a rail of five locked sections
 * down the right-hand side, and a console along the bottom. Every clue, once
 * solved, spells a word out *in the room* — developed on paper, printed on a
 * page, written in a web, thrown on the floor in light. The player reads that
 * word, types it into the console, and the matching section opens and shows
 * its share of the reveal code. All five open, and the room hands
 * `CODES.room` up to the shell.
 *
 * TWO KINDS OF STATE, and the difference matters:
 *
 *   `read`   — the clue has been solved in the world. This is what keeps a
 *              revealed thing revealed: the board stays developed, the book
 *              re-opens straight to its page, the web stays across the bench,
 *              the stags stay lit. It never unlocks anything by itself.
 *   `opened` — the word has been typed into the console. This, and only this,
 *              is what opens a section and what decides whether the room is
 *              solved.
 *
 * Keeping them apart is what makes the console a real step rather than
 * decoration. It also means a team can solve the clues in any order, walk away,
 * and come back to type — and that a coordinator watching the screen can see
 * the difference between "they found it" and "they entered it".
 *
 * Sections are not gated on each other. Five people round one laptop do not
 * search in the order an author imagined, and a puzzle that insists on an order
 * mostly produces a queue.
 */

/** How long a line of feedback stays under the viewport. */
const NOTE_MS = 5200;
/** How long the console stays red after a wrong entry. */
const REJECT_MS = 1800;

export default function MysteryRoom({ onSolve }: PuzzleProps) {
  const fragments = useMemo(() => sectionFragments(), []);
  /** The two letters carried on the face of each loose case item. */
  const itemLetters = useMemo(
    () => fragmentsOf(ROOM_SECTIONS[4].code, ROOM_MANIFEST.length),
    []
  );

  /** Clues solved in the world. */
  const [read, setRead] = useState<SectionId[]>([]);
  /** Sections opened by typing the word into the console. */
  const [opened, setOpened] = useState<SectionId[]>([]);
  /** Loose case items collected. Four of them make up section 5's clue. */
  const [collected, setCollected] = useState<string[]>([]);
  const [held, setHeld] = useState<string | null>(null);

  // Tools. Neither is a task — they are what makes the case board readable.
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
  const [rejected, setRejected] = useState(false);
  /** A book is being held open in front of the player. The room dims behind it. */
  const [reading, setReading] = useState(false);

  // Shared between Player and every clickable — see Player's doc comment.
  const dragRef = useRef<PlayerState>({ moved: false });

  const complete = opened.length === ROOM_SECTIONS.length;

  // In an effect, not during render: calling the parent's setState from a
  // render body is a React error, and it would fire on every entry. What goes
  // up is always the CODES.room constant, never anything reconstructed from
  // per-section state.
  useEffect(() => {
    if (complete) onSolve(CODES.room);
  }, [complete, onSolve]);

  /** Transient line of text under the viewport. Every interaction says something. */
  const say = useCallback((text: string) => setNote(text), []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!rejected) return;
    const t = setTimeout(() => setRejected(false), REJECT_MS);
    return () => clearTimeout(t);
  }, [rejected]);

  const markRead = useCallback((id: SectionId) => {
    setRead((r) => (r.includes(id) ? r : [...r, id]));
  }, []);

  /**
   * One stable callback per clue.
   *
   * These are handed to components that use them as effect dependencies. Passed
   * as inline arrows they would be a fresh function on every render of this
   * component, which re-runs those effects on every render — and an effect that
   * reports "solved" re-running on every render sets the feedback line back to
   * its own message every time anything at all in the room changes.
   */
  const foundBoard = useCallback(() => {
    markRead("s1");
    say(`The ink develops under the blue beam: ${ROOM_SECTIONS[0].code}.`);
  }, [markRead, say]);

  const foundBooks = useCallback(() => {
    markRead("s2");
    say(`The pages settle on one word: ${ROOM_SECTIONS[1].code}.`);
  }, [markRead, say]);

  const foundBench = useCallback(() => {
    markRead("s3");
    say(`The shooter throws a web across the bench, with a word in it: ${ROOM_SECTIONS[2].code}.`);
  }, [markRead, say]);

  const foundDeer = useCallback(() => {
    markRead("s4");
    say(`The beams cross on the boards and spell it out: ${ROOM_SECTIONS[3].code}.`);
  }, [markRead, say]);

  /**
   * A word typed into the console.
   *
   * Deliberately not gated on `read`. A team that works out the answer without
   * doing the mechanic has still worked out the answer, and refusing it would
   * mean explaining to somebody, out loud, in a hall, that they are right but
   * the room wants them to be right differently.
   */
  const submit = useCallback(
    (entry: string) => {
      const section = matchSection(entry);
      if (!section) {
        setRejected(true);
        say("Nothing in this room answers to that.");
        return false;
      }
      if (opened.includes(section.id)) {
        say(`${section.title} is already open.`);
        return true;
      }
      const index = ROOM_SECTIONS.findIndex((s) => s.id === section.id);
      setOpened((o) => [...o, section.id]);
      say(`${section.title} unlocked. It was holding ${fragments[index]}.`);
      return true;
    },
    [opened, fragments, say]
  );

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
  // a key is the difference between playable and fiddly. Both are suppressed
  // while the console has focus, or typing a code would strobe the torch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "f") toggleTorch();
      if (k === "g") attachFilm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTorch, attachFilm]);

  /**
   * Picking up a loose case item. Four of them, and the fourth completes the
   * clue.
   *
   * The messages are worked out here rather than inside the state updater: a
   * setState updater runs during React's render pass, and calling another
   * setter from in there is an error — React is free to run the updater more
   * than once, and every call would fire again.
   */
  const collect = useCallback(
    (id: string) => {
      setHeld((h) => (h === id ? null : id));
      if (collected.includes(id)) return;

      const count = collected.length + 1;
      setCollected([...collected, id]);
      if (count === ROOM_MANIFEST.length) {
        markRead("s5");
        say("All four. Laid out in order, the letters stamped on their faces spell a word.");
      } else {
        say(`Case item recovered — ${count} of ${ROOM_MANIFEST.length}. Something is stamped on the face.`);
      }
    },
    [collected, markRead, say]
  );

  const itemsDone = collected.length === ROOM_MANIFEST.length;

  return (
    <div>
      <div className="panel relative h-[640px] w-full overflow-hidden">
        <RoomBoundary>
          <Canvas shadows camera={{ fov: 55, position: [0, 1.62, 3.2] }}>
            <color attach="background" args={["#0b0e14"]} />
            <fogExp2 attach="fog" args={["#141a24", 0.014]} />

            <Player dragRef={dragRef} />
            <RoomScene />
            <Drawers dragRef={dragRef} onNote={say} />

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

            {/* Section 1 — the case board */}
            <Board
              phrase={ROOM_SECTIONS[0].code}
              torchOn={torchOn}
              filmOn={filmOn}
              solved={read.includes("s1")}
              onReveal={foundBoard}
            />

            {/* Section 2 — the reading cupboards */}
            <Books
              dragRef={dragRef}
              found={read.includes("s2")}
              onNote={say}
              onFound={foundBooks}
              onReading={setReading}
            />

            {/* Section 3 — the fluid bench */}
            <WebBench dragRef={dragRef} found={read.includes("s3")} onNote={say} onFound={foundBench} />

            {/* Section 4 — the two stags */}
            <Deer dragRef={dragRef} found={read.includes("s4")} onNote={say} onFound={foundDeer} />

            {/* Section 5 — the four loose case items */}
            {ROOM_MANIFEST.map((slot, i) => (
              <Prop
                key={slot.id}
                slot={slot}
                clue={itemLetters[i] ?? "?"}
                held={held === slot.id}
                found={collected.includes(slot.id)}
                onPick={() => collect(slot.id)}
                dragRef={dragRef}
              />
            ))}
          </Canvas>
        </RoomBoundary>

        <Hud
          fragments={fragments}
          opened={opened}
          read={read}
          torchTaken={torchTaken}
          torchOn={torchOn}
          filmTaken={filmTaken}
          filmOn={filmOn}
          itemLetters={itemsDone ? itemLetters : null}
          note={note}
          rejected={rejected}
          reading={reading}
          onSubmit={submit}
        />
      </div>

      <p className="mt-3 text-sm text-paper-white/70">
        <strong className="text-paper-white">WASD</strong> or arrow keys to walk,{" "}
        <strong className="text-paper-white">drag</strong> to look,{" "}
        <strong className="text-paper-white">click</strong> to open and pick things up,{" "}
        <strong className="text-paper-white">R</strong> to return to the door. Type each code you find into
        the console. Opened {opened.length} of {ROOM_SECTIONS.length}.
      </p>
    </div>
  );
}

interface HudProps {
  fragments: string[];
  opened: SectionId[];
  read: SectionId[];
  torchTaken: boolean;
  torchOn: boolean;
  filmTaken: boolean;
  filmOn: boolean;
  /** The four item faces, in order, once all four have been collected. */
  itemLetters: string[] | null;
  note: string | null;
  rejected: boolean;
  /** A book is open in front of the player. */
  reading: boolean;
  onSubmit: (entry: string) => boolean;
}

/**
 * The 2D overlay: the task rail, the console, what is in hand, one line of
 * feedback.
 *
 * The wrapper takes no pointer events, so drags pass through it to the canvas
 * and looking around still works with the cursor anywhere on screen. Only the
 * console and the rail turn them back on, and only over themselves.
 *
 * Anything revealed in 3D is echoed here in plain DOM. The 3D text is drawn by
 * troika, which fetches its default font over the network — on a locked-down
 * event wifi that can fail silently, and a puzzle whose entire payoff is a line
 * of text must not have a single point of failure that renders nothing and says
 * nothing.
 */
function Hud({
  fragments,
  opened,
  read,
  torchTaken,
  torchOn,
  filmTaken,
  filmOn,
  itemLetters,
  note,
  rejected,
  reading,
  onSubmit,
}: HudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      {/* Everything but the open book goes dark.
          A vignette rather than a flat wash, because this overlay sits on top
          of the canvas and a flat one would dim the book along with the room.
          The hole is where the book is held, a little below centre. Done in the
          DOM rather than with a plane in the scene for the reason on
          `onReading` in MysteryRoomBooks. */}
      <div
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-300 ${
          reading ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "radial-gradient(ellipse 36% 46% at 42% 54%, rgba(5,7,12,0) 0%, rgba(5,7,12,0.55) 62%, rgba(5,7,12,0.88) 100%)",
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="rounded bg-black/55 px-3 py-1.5 font-mono text-xs tracking-widest text-paper-white/85 backdrop-blur-sm">
          SECTIONS {opened.length}/{fragments.length}
        </div>
        <div className="flex gap-2">
          <Chip active={torchTaken} label={torchTaken ? (torchOn ? "TORCH · ON" : "TORCH · OFF") : "TORCH · ?"} />
          <Chip active={filmTaken} label={filmTaken ? (filmOn ? "GEL · FITTED" : "GEL · LOOSE") : "GEL · ?"} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-3">
        <div className="flex-1">
          {/* Crosshair — with a walkable camera, a fixed centre point is what
              makes aiming the beam at a specific sheet of paper possible. */}
          <div className="mx-auto h-1.5 w-1.5 rounded-full bg-paper-white/45" />
        </div>
        <TaskRail fragments={fragments} opened={opened} read={read} />
      </div>

      <div className="space-y-2">
        {itemLetters && (
          <p className="mx-auto w-fit rounded border border-[#c39b52] bg-[#2a1f10]/85 px-4 py-1.5 font-mono text-sm tracking-[0.35em] text-[#f0d9a8] backdrop-blur-sm">
            {itemLetters.join(" ")}
          </p>
        )}
        {note && (
          <p className="mx-auto w-fit max-w-[46rem] text-center rounded bg-black/70 px-3 py-1.5 text-sm text-paper-white/90 backdrop-blur-sm">
            {note}
          </p>
        )}
        <CodeConsole rejected={rejected} onSubmit={onSubmit} />
      </div>
    </div>
  );
}

/**
 * The five sections, down the right-hand side.
 *
 * A locked section shows its hint, so the rail doubles as the list of what is
 * left to look for — five padlocks with no text would tell a stuck team
 * nothing except that they are stuck. A section whose clue has been solved but
 * whose word has not been typed is marked, because the gap between those two
 * is exactly the thing a player is most likely to lose track of.
 */
function TaskRail({
  fragments,
  opened,
  read,
}: {
  fragments: string[];
  opened: SectionId[];
  read: SectionId[];
}) {
  return (
    <ul className="pointer-events-auto flex w-60 shrink-0 flex-col gap-1.5 overflow-y-auto rounded-lg bg-black/55 p-2 backdrop-blur-sm">
      {ROOM_SECTIONS.map((section, i) => {
        const isOpen = opened.includes(section.id);
        const isRead = read.includes(section.id);
        return (
          <li
            key={section.id}
            className={`rounded border px-2.5 py-2 transition-colors ${
              isOpen
                ? "border-[#3f7bff]/70 bg-[#0a1836]/80"
                : isRead
                  ? "border-[#c39b52]/60 bg-[#241a0c]/70"
                  : "border-white/10 bg-black/35"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={`font-mono text-[0.62rem] tracking-widest ${
                  isOpen ? "text-[#9fc6ff]" : "text-paper-white/45"
                }`}
              >
                {String(i + 1).padStart(2, "0")} · {section.title.toUpperCase()}
              </span>
              <span className={`font-mono text-sm ${isOpen ? "text-[#bfe0ff]" : "text-paper-white/30"}`}>
                {isOpen ? fragments[i] : "──"}
              </span>
            </div>
            <p className="mt-1 text-[0.68rem] leading-snug text-paper-white/55">
              {isOpen ? "Open." : isRead ? "Solved. Type the word into the console." : section.hint}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The console along the bottom.
 *
 * A real text input, which is why every key handler in the room checks
 * `isTypingTarget` first: they all listen on `window`, and without that check
 * typing a word in here would also walk the player across the room and flash
 * the torch on and off while they did it.
 *
 * Escape hands focus back to the room, and so does a correct entry — that is
 * the moment the player wants to go and look for the next one, and leaving the
 * caret in the box would leave them with dead movement keys and no idea why.
 */
function CodeConsole({
  rejected,
  onSubmit,
}: {
  rejected: boolean;
  onSubmit: (entry: string) => boolean;
}) {
  const [entry, setEntry] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function send() {
    if (entry.trim().length === 0) return;
    const ok = onSubmit(entry);
    setEntry("");
    if (ok) input.current?.blur();
  }

  return (
    <div
      className={`pointer-events-auto mx-auto flex w-full max-w-2xl items-center gap-2 rounded-lg border px-3 py-2 backdrop-blur-sm transition-colors ${
        rejected ? "border-[#c8352f] bg-[#2a0e0c]/85" : "border-white/15 bg-black/70"
      }`}
    >
      <span aria-hidden className="font-mono text-sm text-[#9fc6ff]">
        &gt;
      </span>
      <input
        ref={input}
        value={entry}
        onChange={(e) => setEntry(e.target.value)}
        onKeyDown={(e) => {
          // Stop here rather than letting these reach the window listeners.
          e.stopPropagation();
          if (e.key === "Enter") send();
          if (e.key === "Escape") input.current?.blur();
        }}
        placeholder="Type a code you found in the room"
        aria-label="Code entry"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono text-sm tracking-[0.2em] text-paper-white outline-none placeholder:tracking-normal placeholder:text-paper-white/35"
      />
      <button
        type="button"
        onClick={send}
        className="shrink-0 rounded bg-[#1a2c52] px-3 py-1 font-mono text-[0.68rem] tracking-widest text-[#bfe0ff] transition-colors hover:bg-[#24407a]"
      >
        ENTER
      </button>
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
