"use client";

import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Object3D, Vector3 } from "three";

/**
 * The pinboard, and the phrase written on it in ink that only answers to blue
 * light.
 *
 * HOW THE REVEAL IS DECIDED. Not by a shader, and not by sampling what the
 * spotlight actually lit — both are expensive and, worse, unpredictable on
 * whatever GPU is plugged into the projector on the day. It is four plain
 * geometric conditions evaluated per frame against the camera:
 *
 *   1. the torch is on                       (state, from MysteryRoom)
 *   2. the blue gel is clipped over the lens  (state, from MysteryRoom)
 *   3. the player is aimed at this paper      (dot of view direction)
 *   4. the player is close enough             (distance)
 *
 * Miss any one and the phrase stays invisible. That includes the case the
 * whole puzzle turns on: torch on, no gel, aimed point blank — the paper
 * lights up white and stays blank, because condition 2 is false. The player
 * can see plainly that the light is reaching it and the writing is not
 * there, which is what makes the gel feel like the answer rather than a
 * random object.
 *
 * The strength value is continuous rather than a boolean, so the phrase fades
 * up as the beam settles on the paper instead of popping. It is quantised
 * before it reaches React state — a value that changed every frame would
 * re-render this subtree at 60fps for no visible gain.
 */

/** Local position of the secret paper on the board face. */
const SECRET_AT: [number, number, number] = [0.42, -0.18, 0.03];

const REVEAL = {
  /** Beyond this, the beam is too spread out to develop the ink. */
  farRange: 4.6,
  /** Inside this, range stops mattering at all. */
  nearRange: 2.6,
  /** Dot product of view direction against the direction to the paper. */
  aimLoose: 0.88,
  aimTight: 0.985,
  /** Strength above which the phrase counts as read. */
  latchAt: 0.75,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface BoardProps {
  /** The words that appear under blue light. */
  phrase: string;
  torchOn: boolean;
  filmOn: boolean;
  /** Fired once, the first time the phrase is actually read. */
  onReveal: () => void;
  /** Kept lit once solved, so a team can show a coordinator what they found. */
  solved: boolean;
}

export default function Board({ phrase, torchOn, filmOn, onReveal, solved }: BoardProps) {
  const { camera } = useThree();
  const secret = useRef<Object3D>(null);
  const worldPos = useRef(new Vector3());
  const worldNormal = useRef(new Vector3());
  const toPaper = useRef(new Vector3());
  const viewDir = useRef(new Vector3());

  /** 0..1, quantised. Drives both the ink opacity and the pool of light on the paper. */
  const [strength, setStrength] = useState(0);
  const latched = useRef(false);

  useFrame(() => {
    const node = secret.current;
    if (!node) return;

    let next = 0;
    const lit = torchOn;

    if (lit) {
      node.getWorldPosition(worldPos.current);
      node.getWorldDirection(worldNormal.current);
      camera.getWorldDirection(viewDir.current);
      toPaper.current.copy(worldPos.current).sub(camera.position);

      const dist = toPaper.current.length();
      toPaper.current.normalize();

      const aim = viewDir.current.dot(toPaper.current);
      const facing = worldNormal.current.dot(toPaper.current);

      // facing < 0 means the paper's front is turned back toward the player.
      if (facing < -0.2) {
        next =
          smoothstep(REVEAL.aimLoose, REVEAL.aimTight, aim) *
          (1 - smoothstep(REVEAL.nearRange, REVEAL.farRange, dist));
      }
    }

    // Quantise: 20 steps is a smooth-looking fade and at most a handful of
    // re-renders as the beam sweeps across.
    const q = Math.round(next * 20) / 20;
    setStrength((prev) => (prev === q ? prev : q));

    // The ink only develops through the gel. Raw light reaches the paper and
    // does nothing, which is the whole lesson of the puzzle.
    if (filmOn && q >= REVEAL.latchAt && !latched.current) {
      latched.current = true;
      onReveal();
    }
  });

  const inkOpacity = filmOn ? strength : 0;
  const poolOpacity = strength * (filmOn ? 0.5 : 0.34);

  return (
    // Right wall, face turned into the room.
    <group position={[5.88, 1.72, -1.0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* Frame and cork */}
      <mesh position={[0, 0, -0.03]} receiveShadow>
        <boxGeometry args={[2.75, 1.95, 0.08]} />
        <meshStandardMaterial color="#6a4c2f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.02]} receiveShadow>
        <planeGeometry args={[2.5, 1.7]} />
        <meshStandardMaterial color="#9c7a52" roughness={1} />
      </mesh>

      {/* Decoy paperwork, pinned. None of these carry anything. */}
      {[
        { x: -0.86, y: 0.42, w: 0.52, h: 0.66, tilt: 0.05, colour: "#efe7d5" },
        { x: -0.25, y: 0.5, w: 0.46, h: 0.34, tilt: -0.08, colour: "#ded2b6" },
        { x: 0.38, y: 0.46, w: 0.4, h: 0.52, tilt: 0.11, colour: "#efe7d5" },
        { x: 0.95, y: 0.3, w: 0.5, h: 0.4, tilt: -0.04, colour: "#d8cbb0" },
        { x: -0.9, y: -0.38, w: 0.44, h: 0.5, tilt: -0.1, colour: "#ded2b6" },
        { x: -0.28, y: -0.44, w: 0.5, h: 0.42, tilt: 0.06, colour: "#efe7d5" },
        { x: 1.0, y: -0.42, w: 0.42, h: 0.46, tilt: 0.09, colour: "#efe7d5" },
      ].map((p) => (
        <group key={`${p.x}:${p.y}`} position={[p.x, p.y, 0.03]} rotation={[0, 0, p.tilt]}>
          <mesh>
            <planeGeometry args={[p.w, p.h]} />
            <meshStandardMaterial color={p.colour} roughness={0.95} />
          </mesh>
          {/* Ruled lines, so a blank rectangle reads as a document */}
          {[0.28, 0.16, 0.04, -0.08, -0.2].map((ly) =>
            Math.abs(ly) < p.h / 2 - 0.06 ? (
              <mesh key={ly} position={[0, ly, 0.002]}>
                <planeGeometry args={[p.w * 0.72, 0.012]} />
                <meshBasicMaterial color="#9c9484" />
              </mesh>
            ) : null
          )}
          <mesh position={[0, p.h / 2 - 0.05, 0.02]}>
            <sphereGeometry args={[0.022, 10, 10]} />
            <meshStandardMaterial color="#c8352f" roughness={0.4} metalness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Red string between two pins, because every board like this has one */}
      <mesh position={[-0.24, 0.02, 0.045]} rotation={[0, 0, -0.62]}>
        <boxGeometry args={[1.35, 0.012, 0.004]} />
        <meshBasicMaterial color="#a8261f" />
      </mesh>

      {/* THE paper. Same stock as the decoys on purpose — nothing about it
          looks different until light of the right colour lands on it. */}
      <group position={SECRET_AT} rotation={[0, 0, -0.03]}>
        <object3D ref={secret} />
        <mesh>
          <planeGeometry args={[0.86, 0.5]} />
          <meshStandardMaterial color="#f2ead8" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.21, 0.02]}>
          <sphereGeometry args={[0.024, 10, 10]} />
          <meshStandardMaterial color="#2f6bff" roughness={0.35} metalness={0.3} />
        </mesh>

        {/* The pool of torch light landing on it. White with the raw lamp,
            blue through the gel — visible either way, so the player can tell
            they are aiming correctly and the light simply is not doing
            anything yet. */}
        {strength > 0 && (
          <mesh position={[0, 0, 0.004]}>
            <planeGeometry args={[0.84, 0.48]} />
            <meshBasicMaterial
              color={filmOn ? "#3f7bff" : "#fff3d8"}
              transparent
              opacity={poolOpacity}
              depthWrite={false}
              blending={2}
            />
          </mesh>
        )}

        {/* The ink. Present in the scene graph at all times and simply
            transparent — never conditionally mounted — so there is no frame
            where it pops in, and nothing about its geometry to notice before
            it is revealed. */}
        <Text
          position={[0, 0.04, 0.008]}
          fontSize={0.082}
          maxWidth={0.76}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color="#bfe0ff"
          outlineWidth={0.004}
          outlineColor="#0a2f7a"
          fillOpacity={solved ? 1 : inkOpacity}
          outlineOpacity={solved ? 1 : inkOpacity}
        >
          {phrase}
        </Text>
      </group>

      {/* Board label, always readable — the board has to be findable even
          before anyone knows what it is for. */}
      <Text
        position={[0, 0.93, 0.04]}
        fontSize={0.1}
        anchorX="center"
        anchorY="middle"
        color="#2b2118"
      >
        CASE BOARD
      </Text>
    </group>
  );
}
