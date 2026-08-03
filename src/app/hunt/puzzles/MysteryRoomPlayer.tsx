"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OBSTACLES, WALK_BOUNDS } from "./MysteryRoomScene";

/** Pixels of pointer travel between pointerdown and pointerup before a gesture counts as a look-drag rather than a click. */
const DRAG_THRESHOLD_PX = 6;

const EYE_HEIGHT = 1.62;
const BODY_RADIUS = 0.34;
const WALK_SPEED = 3.1; // metres per second
const LOOK_SENSITIVITY = 0.0026;
/** Pitch only. Yaw is unclamped now — you cannot search a room you cannot turn around in. */
const PITCH_MIN = -1.15;
const PITCH_MAX = 0.95;

const SPAWN: [number, number] = [0, 3.2];

export interface PlayerState {
  /** True once the current down-to-up gesture has travelled far enough to be a look, not a click. */
  moved: boolean;
}

/**
 * Look and walk.
 *
 * DELIBERATE DEPARTURE FROM THE ORIGINAL DESIGN. The guide's room had a fixed
 * camera that could only turn, with yaw clamped to +/-0.85 rad, on the
 * reasoning that a player wedged in a wall on stage is unrecoverable. That
 * reasoning still holds, so walking is added with the failure mode designed
 * out rather than hoped away:
 *
 *   - No physics and no vertical axis. The player is a circle on a plane at a
 *     fixed eye height; there is nothing to fall off, fall through, or get
 *     launched by.
 *   - Movement is resolved against axis-aligned footprints exported from
 *     MysteryRoomScene (OBSTACLES) by pushing out along the shallowest axis.
 *     Being pushed out is the only failure mode, and it always ends with the
 *     player standing somewhere legal.
 *   - Walls clamp before obstacles, so no combination of the two can put the
 *     player outside the room.
 *   - R returns to the spawn point, as the last resort a coordinator can
 *     shout across a hall.
 *
 * `dragRef` is shared with every pickup: a browser's native "click" fires on
 * wherever pointerup lands, regardless of how far the pointer travelled since
 * pointerdown, so without this a look-drag that starts and ends over the same
 * object registers as a pick. `moved` is set once travel crosses the
 * threshold and is reset only on the next pointerdown — never on pointerup —
 * so it is still correct when the click that follows pointerup is dispatched.
 */
export default function Player({ dragRef }: { dragRef: MutableRefObject<PlayerState> }) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef<[number, number]>([...SPAWN] as [number, number]);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const keys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const el = gl.domElement;

    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY };
      gestureStart.current = { x: e.clientX, y: e.clientY };
      dragRef.current.moved = false;
    };
    const up = () => {
      drag.current = null;
      gestureStart.current = null;
    };
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      yaw.current -= (e.clientX - drag.current.x) * LOOK_SENSITIVITY;
      pitch.current = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, pitch.current - (e.clientY - drag.current.y) * LOOK_SENSITIVITY)
      );
      drag.current = { x: e.clientX, y: e.clientY };

      if (gestureStart.current) {
        const dx = e.clientX - gestureStart.current.x;
        const dy = e.clientY - gestureStart.current.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragRef.current.moved = true;
      }
    };

    const keyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        // Otherwise the arrow keys scroll the page out from under the canvas.
        e.preventDefault();
        keys.current.add(k);
      }
      if (k === "r") pos.current = [...SPAWN] as [number, number];
    };
    const keyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    // Held keys would stick down forever if focus left mid-stride.
    const blur = () => keys.current.clear();

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, [gl, dragRef]);

  useFrame((_state, delta) => {
    const k = keys.current;
    const forward = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const strafe = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);

    if (forward !== 0 || strafe !== 0) {
      // Normalise so diagonals are not faster than a straight line.
      const len = Math.hypot(forward, strafe);
      const step = Math.min(delta, 0.05) * WALK_SPEED; // cap the step so a tab-out cannot teleport
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);

      let [x, z] = pos.current;
      x += ((-sin * forward) / len + (cos * strafe) / len) * step;
      z += ((-cos * forward) / len - (sin * strafe) / len) * step;

      // Walls first, so no obstacle push can land the player outside the room.
      x = Math.max(WALK_BOUNDS.minX + BODY_RADIUS, Math.min(WALK_BOUNDS.maxX - BODY_RADIUS, x));
      z = Math.max(WALK_BOUNDS.minZ + BODY_RADIUS, Math.min(WALK_BOUNDS.maxZ - BODY_RADIUS, z));

      // Then furniture: if inside an expanded footprint, leave along whichever
      // side is nearest. Shallowest-axis push is what makes sliding along a
      // desk edge feel like sliding rather than sticking.
      for (const o of OBSTACLES) {
        const minX = o.minX - BODY_RADIUS;
        const maxX = o.maxX + BODY_RADIUS;
        const minZ = o.minZ - BODY_RADIUS;
        const maxZ = o.maxZ + BODY_RADIUS;
        if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;

        const outLeft = x - minX;
        const outRight = maxX - x;
        const outBack = z - minZ;
        const outFront = maxZ - z;
        const least = Math.min(outLeft, outRight, outBack, outFront);
        if (least === outLeft) x = minX;
        else if (least === outRight) x = maxX;
        else if (least === outBack) z = minZ;
        else z = maxZ;
      }

      pos.current = [x, z];
    }

    camera.position.set(pos.current[0], EYE_HEIGHT, pos.current[1]);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");

    // Development-only test seam. scripts/shoot-room.mjs drives the room in a
    // headless browser to prove the torch puzzle can actually be completed,
    // and it cannot navigate by dead reckoning: walking distance depends on
    // frame rate, and headless Chromium renders WebGL on the CPU at a
    // fraction of real speed. Publishing the true position lets that script
    // steer with feedback instead of guessing, which is the difference
    // between a route that verifies the puzzle and one that wanders into a
    // corner and reports success. Stripped from production builds.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __room?: unknown }).__room = {
        x: pos.current[0],
        z: pos.current[1],
        y: EYE_HEIGHT,
        yaw: yaw.current,
        pitch: pitch.current,
      };
    }
  });

  return null;
}
