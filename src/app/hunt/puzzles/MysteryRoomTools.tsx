"use client";

import { useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Object3D, SpotLight, Vector3 } from "three";
import type { Group } from "three";
import type { PlayerState } from "./MysteryRoomPlayer";

/**
 * The two tools: a torch, and a blue gel filter that clips over its lens.
 *
 * Neither is a code fragment. They are instruments — what they exist for is
 * to make the noticeboard readable (see MysteryRoomBoard.tsx). Keeping them
 * out of ROOM_MANIFEST means the reveal code still assembles from exactly the
 * five task props, in manifest order, and finding the torch can never
 * accidentally count as progress toward the answer.
 */

/**
 * Where each tool hides. Both need a walk to reach — that is the point of them.
 *
 * The torch lies on the floor at the front edge of the desk: invisible from
 * the spawn point, and it takes looking down to see. The gel sits in the one
 * filing-cabinet drawer left open, at the far end of the room from the torch,
 * so neither find hands you the other.
 */
export const TORCH_HOME: [number, number, number] = [-2.35, 0.09, -2.35];
export const FILM_HOME: [number, number, number] = [-4.25, 1.2, -2.2];

/** Beam colour with the raw lamp, and through the blue gel. */
const BEAM_RAW = "#fff2d8";
const BEAM_BLUE = "#2f6bff";

interface Interactive {
  dragRef: MutableRefObject<PlayerState>;
  onPick: () => void;
}

/** Shared hover affordance: a faint ring under a pickup, so a small object on a busy floor is still findable. */
function Halo({ radius = 0.22, colour = "#ffd479" }: { radius?: number; colour?: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <ringGeometry args={[radius, radius * 1.32, 28]} />
      <meshBasicMaterial color={colour} transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

/**
 * The torch as it lies in the world, before it is picked up.
 *
 * Rendered lying on its side on the floor under the desk. It is not lit and
 * not labelled: it has to be looked for. The hover halo is the only
 * concession, and it only appears once the pointer is already on it.
 */
export function TorchPickup({ dragRef, onPick }: Interactive) {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={TORCH_HOME}
      rotation={[0, 0.7, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (dragRef.current.moved) return;
        onPick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <TorchModel on={false} film={false} highlight={hovered} />
      {hovered && <Halo radius={0.19} />}
    </group>
  );
}

/**
 * The blue gel, sitting in the open filing-cabinet drawer.
 *
 * Deliberately across the room from the torch: a player who has the torch
 * still has to search, and a player who finds the gel first has something
 * they cannot use yet, which is the clue that a torch exists at all.
 */
export function FilmPickup({ dragRef, onPick }: Interactive) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<Group>(null);

  // A slow tilt. A flat translucent square lying still in a drawer is
  // genuinely invisible; a moving highlight catches the eye without
  // signposting it.
  useFrame((state) => {
    if (ref.current) ref.current.rotation.z = 0.12 * Math.sin(state.clock.elapsedTime * 0.7);
  });

  return (
    <group
      ref={ref}
      position={FILM_HOME}
      rotation={[-Math.PI / 2 + 0.12, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (dragRef.current.moved) return;
        onPick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {/* The gel itself */}
      <mesh>
        <planeGeometry args={[0.2, 0.2]} />
        <meshStandardMaterial
          color={BEAM_BLUE}
          transparent
          opacity={hovered ? 0.95 : 0.78}
          emissive={BEAM_BLUE}
          emissiveIntensity={hovered ? 0.9 : 0.45}
          roughness={0.15}
          side={2}
        />
      </mesh>
      {/* Card mount, so it reads as a filter and not a blue sticky note */}
      <mesh position={[0, 0, -0.002]}>
        <ringGeometry args={[0.098, 0.13, 4]} />
        <meshStandardMaterial color="#1b1f28" roughness={0.9} side={2} />
      </mesh>
    </group>
  );
}

/** The torch body, shared by the world pickup and the in-hand copy. Points along -Z. */
function TorchModel({ on, film, highlight }: { on: boolean; film: boolean; highlight?: boolean }) {
  return (
    <group>
      {/* Barrel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.046, 0.26, 16]} />
        <meshStandardMaterial
          color={highlight ? "#5d6673" : "#3d444f"}
          metalness={0.65}
          roughness={0.35}
        />
      </mesh>
      {/* Knurled grip */}
      {[-0.02, 0.02, 0.06].map((z) => (
        <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.045, 0.006, 6, 18]} />
          <meshStandardMaterial color="#2a3038" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      {/* Head */}
      <mesh position={[0, 0, -0.18]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.072, 0.048, 0.1, 18]} />
        <meshStandardMaterial color="#b98a3f" metalness={0.75} roughness={0.3} />
      </mesh>
      {/* Lens */}
      <mesh position={[0, 0, -0.229]} rotation={[0, 0, 0]}>
        <circleGeometry args={[0.066, 20]} />
        <meshBasicMaterial
          color={on ? (film ? BEAM_BLUE : "#fff8e6") : "#7d858f"}
          transparent
          opacity={on ? 1 : 0.75}
        />
      </mesh>
      {/* The blue gel, clipped over the lens */}
      {film && (
        <group position={[0, 0, -0.238]}>
          <mesh>
            <circleGeometry args={[0.07, 20]} />
            <meshBasicMaterial color={BEAM_BLUE} transparent opacity={0.72} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.069, 0.082, 20]} />
            <meshStandardMaterial color="#1b1f28" roughness={0.9} />
          </mesh>
        </group>
      )}
      {/* On button, on the top of the barrel */}
      <mesh position={[0, 0.05, 0.02]} castShadow>
        <boxGeometry args={[0.032, 0.016, 0.05]} />
        <meshStandardMaterial
          color={on ? "#ff4d4d" : "#8b2b2b"}
          emissive={on ? "#ff2222" : "#000000"}
          emissiveIntensity={on ? 1.4 : 0}
          roughness={0.4}
        />
      </mesh>
      {/* Tail cap */}
      <mesh position={[0, 0, 0.14]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.048, 0.048, 0.03, 16]} />
        <meshStandardMaterial color="#2a3038" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

interface HeldTorchProps {
  on: boolean;
  film: boolean;
  hasFilm: boolean;
  dragRef: MutableRefObject<PlayerState>;
  onToggle: () => void;
  onAttachFilm: () => void;
}

/**
 * The torch once it is in hand.
 *
 * It is not parented to the camera object — it copies the camera's transform
 * every frame and offsets from there. Same result, but the torch stays a
 * normal member of the scene graph, so it is still raycast normally and its
 * button and head remain clickable. Parenting to the camera puts it in view
 * space, where pointer events get fiddly.
 *
 * Two click targets, both on the model itself rather than on a 2D button:
 *   - the red button toggles the beam
 *   - the head clips the gel on, once the gel has been found
 *
 * Keyboard equivalents (F and G) live in MysteryRoom.tsx, because a small
 * target held at the edge of the view is a fussy thing to hit on a laptop
 * trackpad in a hall.
 */
export function HeldTorch({ on, film, hasFilm, dragRef, onToggle, onAttachFilm }: HeldTorchProps) {
  const { camera } = useThree();
  const rig = useRef<Group>(null);
  const light = useRef<SpotLight>(null);
  const target = useRef<Object3D>(null);
  const forward = useRef(new Vector3());
  const [hoverButton, setHoverButton] = useState(false);
  const [hoverHead, setHoverHead] = useState(false);

  useFrame(() => {
    const g = rig.current;
    if (!g) return;

    // Hold it low and to the right, angled slightly inward — the pose a hand
    // actually takes, and it keeps the middle of the screen clear.
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.translateX(0.3);
    g.translateY(-0.24);
    g.translateZ(-0.42);
    g.rotateY(-0.12);
    g.rotateX(0.06);

    if (!light.current || !target.current) return;
    camera.getWorldDirection(forward.current);
    // Beam starts at the lens, not at the eye, or the near geometry lights up
    // from the inside.
    light.current.position.copy(camera.position).addScaledVector(forward.current, 0.4);
    target.current.position.copy(camera.position).addScaledVector(forward.current, 8);
    target.current.updateMatrixWorld();
    light.current.target = target.current;
  });

  return (
    <group>
      <group ref={rig}>
        <TorchModel on={on} film={film} />

        {/* Click target for the button — a slightly larger invisible box, because
            the visible button is 3cm across and this is played on a trackpad. */}
        <mesh
          position={[0, 0.06, 0.02]}
          onClick={(e) => {
            e.stopPropagation();
            if (dragRef.current.moved) return;
            onToggle();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoverButton(true);
          }}
          onPointerOut={() => setHoverButton(false)}
        >
          <boxGeometry args={[0.08, 0.06, 0.1]} />
          <meshBasicMaterial transparent opacity={hoverButton ? 0.22 : 0} color="#ffd479" />
        </mesh>

        {/* Click target for the head — clips the gel on */}
        <mesh
          position={[0, 0, -0.2]}
          onClick={(e) => {
            e.stopPropagation();
            if (dragRef.current.moved) return;
            if (hasFilm && !film) onAttachFilm();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoverHead(true);
          }}
          onPointerOut={() => setHoverHead(false)}
        >
          <cylinderGeometry args={[0.1, 0.1, 0.14, 12]} />
          <meshBasicMaterial
            transparent
            opacity={hoverHead && hasFilm && !film ? 0.22 : 0}
            color={BEAM_BLUE}
          />
        </mesh>

        {/* Visible beam cone. The spotlight alone is nearly invisible in a room
            this bright, and a torch you cannot see the beam of does not read as
            switched on. Additive, depth-write off, so it never occludes. */}
        {on && (
          <mesh position={[0, 0, -2.2]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.78, 4.0, 24, 1, true]} />
            <meshBasicMaterial
              color={film ? BEAM_BLUE : BEAM_RAW}
              transparent
              opacity={film ? 0.1 : 0.07}
              depthWrite={false}
              blending={2}
              side={2}
            />
          </mesh>
        )}
      </group>

      <object3D ref={target} />
      <spotLight
        ref={light}
        visible={on}
        angle={0.38}
        penumbra={0.5}
        intensity={on ? (film ? 55 : 42) : 0}
        distance={14}
        decay={1.4}
        color={film ? BEAM_BLUE : BEAM_RAW}
      />
    </group>
  );
}
