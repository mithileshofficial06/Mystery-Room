"use client";

import { useState } from "react";
import { REGISTRY } from "./hunt/registry";

/**
 * A standalone preview harness for the Mystery Room.
 *
 * NOT the real event page — that is HuntShell (guide §6.2), which owns the
 * session, the shared answer box and hint purchasing, and is the only thing in
 * the event that submits. This exists purely so the room can be looked at
 * before the shell and the API exist: it stands in for the shell by holding the
 * onSolve(code) result in local state.
 */
export default function RoomPreviewPage() {
  const [answer, setAnswer] = useState("");
  const Room = REGISTRY["hunt-room"].Component;

  return (
    // Wider than the 5xl it was. The room is the page; a container sized for
    // prose was leaving a third of a laptop screen as margin either side of the
    // one thing anybody came here to look at.
    <main className="mx-auto min-h-dvh max-w-7xl px-5 py-8">
      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-glitch-cyan">XPLORE&apos;26</p>
      <h1 className="display-title mt-1 text-4xl text-paper-white">Mystery Room</h1>
      <p className="mt-2 text-sm text-paper-white/60">
        Five clues hidden in an antique room, and five locked sections down the side. Search on foot,
        work out what each clue spells, and type it into the console. Every section you open gives up
        a piece of the code.
      </p>

      <div className="my-6">
        <Room config={{}} onSolve={(code) => setAnswer(code)} />
      </div>

      {/* THE SECOND CODE BOX IS GONE.
          There used to be a text input down here holding whatever the room
          handed up. It made sense when the room finished silently — it was the
          only place the reveal code ever appeared. The room now ends with a
          completion card that shows the code, so this was a second, emptier box
          asking to be typed into, sitting directly under the console that
          actually wants typing. Two inputs, one of which does nothing, is the
          kind of thing a team loses five minutes to in a hall.

          The handoff itself is unchanged and still worth showing — it is the
          one thing this preview page exists to stand in for — so it is reported
          as a line of text, and only once there is something to report. */}
      {answer && (
        <p className="font-mono text-sm text-paper-white/60">
          <span className="text-glitch-cyan">HANDED UP TO THE SHELL:</span>{" "}
          <span className="text-paper-white">{answer}</span>{" "}
          <span className="text-paper-white/40">(the shell would submit this — preview only)</span>
        </p>
      )}
    </main>
  );
}
