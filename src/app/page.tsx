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
    <main className="mx-auto min-h-dvh max-w-5xl px-5 py-10">
      <p className="text-[0.7rem] uppercase tracking-[0.25em] text-glitch-cyan">XPLORE&apos;26</p>
      <h1 className="display-title mt-1 text-4xl text-paper-white">Mystery Room</h1>
      <p className="mt-2 text-sm text-paper-white/60">
        Five tasks, one code fragment each. Search the room on foot — some of it needs light of the
        right colour.
      </p>

      <div className="my-6">
        <Room config={{}} onSolve={(code) => setAnswer(code)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Enter the code"
          autoComplete="off"
          spellCheck={false}
          className="border-2 border-paper-white/20 bg-ink-black/60 px-3 py-2 font-mono uppercase text-paper-white outline-none transition-colors focus:border-glitch-cyan"
        />
        <span className="text-sm text-paper-white/50">
          (the shell would submit this — preview only)
        </span>
      </div>
    </main>
  );
}
