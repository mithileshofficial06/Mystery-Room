"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";

/**
 * The room itself — everything that is NOT interactive.
 *
 * Kept separate from MysteryRoom.tsx for one reason: scenery is the part that
 * gets reworked over and over (move a shelf, add a cabinet, change where
 * something hides), while the puzzle state machine is the part that must not
 * drift. Rearranging the room can never change what counts as solved.
 *
 * All of it is primitives, so there is no art dependency and nothing to
 * download. It reads as a room because of proportion, clutter and lighting,
 * not because of detail.
 *
 * COORDINATES. The player walks the floor at eye height 1.62, looking freely.
 *
 *   x  -6 (left wall) .... 0 (centre) .... +6 (right wall)
 *   y   0 (floor) ................. 5 (ceiling)
 *   z  -6 (back wall) ............ +4.6 (front wall, behind the spawn)
 */

export const ROOM = {
  halfWidth: 6,
  height: 5,
  backZ: -6,
  frontZ: 4.6,
};

/** Where the player may stand. A body radius is subtracted from this by the controller. */
export const WALK_BOUNDS = {
  minX: -ROOM.halfWidth + 0.5,
  maxX: ROOM.halfWidth - 0.5,
  minZ: ROOM.backZ + 0.5,
  maxZ: ROOM.frontZ - 0.5,
};

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Furniture footprints, in floor coordinates.
 *
 * The controller pushes the player out of these rather than running a physics
 * engine — this is a look-and-search room, not a platformer, and a solved
 * collision bug is worth less here than a player who can never clip into a
 * desk in front of a hall of people. Keep this list in step with the geometry
 * below; it lives in this file precisely so moving a shelf means editing one
 * place.
 */
export const OBSTACLES: Footprint[] = [
  { minX: -3.7, maxX: -0.7, minZ: -3.8, maxZ: -2.2 }, // desk
  // Sized to the chair itself. It was a metre wide for a half-metre chair,
  // and once the body radius was added on top it walled off the gap between
  // the desk and the filing cabinets completely — the only route from that
  // corner back into the room.
  { minX: -3.0, maxX: -2.36, minZ: -2.1, maxZ: -1.4 }, // desk chair
  { minX: 1.1, maxX: 3.7, minZ: -3.4, maxZ: -2.4 }, // bookcase
  { minX: -4.1, maxX: -1.1, minZ: 1.1, maxZ: 2.7 }, // crates and barrel
  { minX: -1.3, maxX: 1.7, minZ: -5.0, maxZ: -3.6 }, // terminal table
  { minX: -6.0, maxX: -4.2, minZ: -4.4, maxZ: -0.2 }, // filing cabinets
  { minX: 4.7, maxX: 6.0, minZ: 1.4, maxZ: 3.2 }, // radiator + plant
  { minX: 3.4, maxX: 4.6, minZ: -5.2, maxZ: -4.2 }, // step ladder
  { minX: -5.6, maxX: -4.6, minZ: 2.2, maxZ: 3.4 }, // coat stand
];

/** One shared palette, so a new piece of furniture doesn't invent its own browns. */
const C = {
  floor: "#3b3f49",
  floorBoard: "#454a55",
  rug: "#5b4636",
  rugTrim: "#6f5642",
  wallLower: "#5b6478",
  wallUpper: "#6b7488",
  ceiling: "#525a6b",
  skirting: "#39404e",
  wood: "#8a6642",
  woodDark: "#6a4c2f",
  woodPale: "#a5825a",
  metal: "#818995",
  metalDark: "#4d545f",
  paper: "#efe7d5",
  paperAged: "#ded2b6",
  brass: "#c39b52",
  green: "#3f6b4e",
  screen: "#2f8f7d",
  glass: "#93b8c9",
};

interface BoxProps {
  position: [number, number, number];
  size: [number, number, number];
  colour: string;
  rotation?: [number, number, number];
  roughness?: number;
  metalness?: number;
}

/** A plain box. Most furniture in here is boxes arranged into a shape. */
function Box({ position, size, colour, rotation, roughness = 0.85, metalness = 0 }: BoxProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={colour} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/** Floor, ceiling, four walls, skirting, dado rail. */
function Structure() {
  const { halfWidth, height, backZ, frontZ } = ROOM;
  const depth = frontZ - backZ;
  const midZ = (frontZ + backZ) / 2;

  const boards = useMemo(
    () => Array.from({ length: 13 }, (_, i) => -halfWidth + 0.45 + i * 0.92),
    [halfWidth]
  );

  return (
    <group>
      {/* Floor, with plank seams so it is not one flat sheet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, depth]} />
        <meshStandardMaterial color={C.floor} roughness={0.9} />
      </mesh>
      {boards.map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, midZ]} receiveShadow>
          <planeGeometry args={[0.06, depth]} />
          <meshStandardMaterial color={C.floorBoard} roughness={1} />
        </mesh>
      ))}

      {/* Rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -0.4]} receiveShadow>
        <planeGeometry args={[6.4, 4.6]} />
        <meshStandardMaterial color={C.rug} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, -0.4]} receiveShadow>
        <planeGeometry args={[5.6, 3.8]} />
        <meshStandardMaterial color={C.rugTrim} roughness={1} />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, midZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, depth]} />
        <meshStandardMaterial color={C.ceiling} roughness={1} />
      </mesh>

      {/* Back wall, two-tone with a dado rail — a flat wall reads as a backdrop, a split one as a room */}
      <mesh position={[0, 0.9, backZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, 1.8]} />
        <meshStandardMaterial color={C.wallLower} roughness={0.96} />
      </mesh>
      <mesh position={[0, 3.4, backZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, 3.2]} />
        <meshStandardMaterial color={C.wallUpper} roughness={0.96} />
      </mesh>
      <Box position={[0, 1.8, backZ + 0.06]} size={[halfWidth * 2, 0.12, 0.12]} colour={C.woodDark} />
      <Box position={[0, 0.1, backZ + 0.06]} size={[halfWidth * 2, 0.2, 0.14]} colour={C.skirting} />

      {/* Left wall */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-halfWidth, height / 2, midZ]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={C.wallLower} roughness={0.96} />
      </mesh>
      <Box position={[-halfWidth + 0.07, 0.1, midZ]} size={[0.14, 0.2, depth]} colour={C.skirting} />

      {/* Right wall */}
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[halfWidth, height / 2, midZ]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={C.wallLower} roughness={0.96} />
      </mesh>
      <Box position={[halfWidth - 0.07, 0.1, midZ]} size={[0.14, 0.2, depth]} colour={C.skirting} />

      {/* Front wall, behind the spawn — needed now that the player can turn all the way round */}
      <mesh rotation={[0, Math.PI, 0]} position={[0, height / 2, frontZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, height]} />
        <meshStandardMaterial color={C.wallUpper} roughness={0.96} />
      </mesh>
      <Box position={[0, 0.1, frontZ - 0.07]} size={[halfWidth * 2, 0.2, 0.14]} colour={C.skirting} />
    </group>
  );
}

/** Writing desk, chair, lamp, mug, paperwork. The torch hides on the floor beneath it. */
function Desk() {
  return (
    <group position={[-2.2, 0, -3.0]} rotation={[0, 0.18, 0]}>
      {/* Top surface lands at exactly y=0.6 */}
      <Box position={[0, 0.55, 0]} size={[2.6, 0.1, 1.1]} colour={C.wood} />
      <Box position={[-1.15, 0.25, 0]} size={[0.12, 0.5, 1.0]} colour={C.woodDark} />
      <Box position={[0.72, 0.25, 0]} size={[0.8, 0.5, 1.0]} colour={C.woodDark} />
      {[0.12, 0.3, 0.46].map((y) => (
        <group key={y}>
          <Box position={[0.72, y, 0.51]} size={[0.7, 0.13, 0.03]} colour={C.woodPale} />
          <Box position={[0.72, y, 0.54]} size={[0.16, 0.03, 0.03]} colour={C.brass} metalness={0.6} roughness={0.4} />
        </group>
      ))}

      {/* Paperwork and a mug */}
      <Box position={[-0.55, 0.61, 0.1]} size={[0.5, 0.02, 0.36]} colour={C.paper} rotation={[0, 0.3, 0]} />
      <Box position={[-0.45, 0.63, 0.02]} size={[0.44, 0.02, 0.32]} colour={C.paperAged} rotation={[0, -0.15, 0]} />
      <mesh position={[-0.05, 0.66, -0.32]} castShadow>
        <cylinderGeometry args={[0.07, 0.06, 0.12, 14]} />
        <meshStandardMaterial color={C.paper} roughness={0.5} />
      </mesh>

      {/* Banker's lamp */}
      <Box position={[-1.0, 0.63, -0.3]} size={[0.24, 0.04, 0.24]} colour={C.metalDark} />
      <mesh position={[-1.0, 0.85, -0.3]} rotation={[0, 0, 0.35]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.44, 8]} />
        <meshStandardMaterial color={C.metalDark} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[-0.86, 1.03, -0.3]} rotation={[Math.PI, 0, 0.5]} castShadow>
        <coneGeometry args={[0.17, 0.2, 14, 1, true]} />
        <meshStandardMaterial color={C.green} roughness={0.5} metalness={0.3} side={2} />
      </mesh>
      <mesh position={[-0.86, 0.94, -0.3]}>
        <sphereGeometry args={[0.07, 10, 10]} />
        <meshBasicMaterial color="#ffe9c4" />
      </mesh>
      <pointLight position={[-0.86, 0.9, -0.3]} intensity={4} distance={4.5} color="#ffcf8f" />

      {/* Chair, pushed out from the desk */}
      <group position={[-0.7, 0, 1.15]} rotation={[0, -0.35, 0]}>
        <Box position={[0, 0.46, 0]} size={[0.52, 0.07, 0.52]} colour={C.woodPale} />
        <Box position={[0, 0.76, -0.24]} size={[0.5, 0.55, 0.06]} colour={C.woodPale} />
        {[
          [-0.21, -0.21],
          [0.21, -0.21],
          [-0.21, 0.21],
          [0.21, 0.21],
        ].map(([x, z]) => (
          <Box key={`${x}:${z}`} position={[x, 0.22, z]} size={[0.05, 0.44, 0.05]} colour={C.woodDark} />
        ))}
      </group>
    </group>
  );
}

/** Four-shelf bookcase, uneven ledgers, a globe and a wind-up clock. */
function Bookcase() {
  const shelfYs = [0.35, 1.065, 1.85, 2.6];
  return (
    <group position={[2.4, 0, -2.9]} rotation={[0, -0.22, 0]}>
      <Box position={[0, 1.55, -0.28]} size={[2.2, 3.1, 0.08]} colour={C.woodDark} />
      <Box position={[-1.06, 1.55, 0]} size={[0.08, 3.1, 0.56]} colour={C.woodDark} />
      <Box position={[1.06, 1.55, 0]} size={[0.08, 3.1, 0.56]} colour={C.woodDark} />
      <Box position={[0, 3.06, 0]} size={[2.2, 0.1, 0.56]} colour={C.wood} />
      {shelfYs.map((y) => (
        <Box key={y} position={[0, y, 0]} size={[2.04, 0.07, 0.56]} colour={C.wood} />
      ))}
      <Ledgers y={0.35} />
      <Ledgers y={1.85} skip />
      <Ledgers y={2.6} />

      {/* Globe on the top shelf */}
      <group position={[0.62, 2.79, 0.02]}>
        <mesh castShadow>
          <sphereGeometry args={[0.16, 18, 18]} />
          <meshStandardMaterial color="#3d6b8a" roughness={0.7} />
        </mesh>
        <mesh rotation={[0, 0, 0.4]}>
          <torusGeometry args={[0.19, 0.012, 8, 24]} />
          <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
        </mesh>
      </group>

      {/* Wind-up clock on the second shelf */}
      <group position={[0.7, 1.24, 0.05]} rotation={[0, -0.25, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.07, 20]} />
          <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.02, 20]} />
          <meshStandardMaterial color={C.paper} roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

/** A run of book spines along one shelf. */
function Ledgers({ y, skip = false }: { y: number; skip?: boolean }) {
  const spines = useMemo(() => {
    const colours = ["#8c4a3f", "#3f5b7a", "#6b6b52", "#96683a", "#47605a", "#7b4d72"];
    const out: { x: number; h: number; w: number; colour: string; tilt: number }[] = [];
    let x = -0.92;
    let i = 0;
    while (x < 0.9) {
      const w = 0.07 + ((i * 37) % 5) * 0.012;
      const h = 0.42 + ((i * 53) % 7) * 0.02;
      // Leave a gap mid-shelf on the "skip" run, so the shelf does not read as
      // a solid painted block.
      if (!(skip && x > -0.25 && x < 0.35)) {
        out.push({ x: x + w / 2, h, w, colour: colours[i % colours.length], tilt: i % 9 === 0 ? 0.14 : 0 });
      }
      x += w + 0.012;
      i += 1;
    }
    return out;
  }, [skip]);

  return (
    <group>
      {spines.map((s) => (
        <Box
          key={`${y}-${s.x}`}
          position={[s.x, y + 0.04 + s.h / 2, 0.02]}
          size={[s.w, s.h, 0.34]}
          colour={s.colour}
          rotation={[0, 0, s.tilt]}
          roughness={0.95}
        />
      ))}
    </group>
  );
}

/** A slatted crate, built as a frame rather than a solid cube. */
function Crate({
  position,
  rotation = 0,
  size = 0.7,
  colour = C.wood,
}: {
  position: [number, number, number];
  rotation?: number;
  size?: number;
  colour?: string;
}) {
  const h = size;
  const t = size * 0.07;
  const half = size / 2;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Corner posts */}
      {[
        [-half + t / 2, -half + t / 2],
        [half - t / 2, -half + t / 2],
        [-half + t / 2, half - t / 2],
        [half - t / 2, half - t / 2],
      ].map(([x, z]) => (
        <Box key={`${x}:${z}`} position={[x, h / 2, z]} size={[t, h, t]} colour={C.woodDark} />
      ))}
      {/* Slats on all four sides */}
      {[-half + t / 2, 0, half - t / 2].map((y) =>
        [
          { p: [0, y + h / 2, -half + t / 2] as [number, number, number], s: [size, t * 1.6, t] as [number, number, number] },
          { p: [0, y + h / 2, half - t / 2] as [number, number, number], s: [size, t * 1.6, t] as [number, number, number] },
          { p: [-half + t / 2, y + h / 2, 0] as [number, number, number], s: [t, t * 1.6, size] as [number, number, number] },
          { p: [half - t / 2, y + h / 2, 0] as [number, number, number], s: [t, t * 1.6, size] as [number, number, number] },
        ].map((slat) => (
          <Box key={`${y}:${slat.p.join()}`} position={slat.p} size={slat.s} colour={colour} />
        ))
      )}
      {/* Lid */}
      <Box position={[0, h, 0]} size={[size + t, t * 1.4, size + t]} colour={C.woodDark} />
    </group>
  );
}

/**
 * Crates, a barrel and a pallet in the near-left corner of the floor.
 *
 * Pushed left of the room's centre line on purpose: parked in the middle it
 * sat a metre and a half from the spawn point and filled the opening view,
 * which is the first thing anyone sees of the puzzle.
 */
function Storage() {
  return (
    <group position={[-2.6, 0, 1.9]}>
      {/* Pallet the satchel prop rests on: its top face is y=0.1 */}
      <Box position={[0, 0.05, 0]} size={[1.5, 0.1, 1.2]} colour={C.woodDark} />
      {[-0.55, 0, 0.55].map((z) => (
        <Box key={z} position={[0, 0.11, z]} size={[1.45, 0.03, 0.22]} colour={C.woodPale} />
      ))}

      <Crate position={[1.2, 0, -0.35]} rotation={0.42} size={0.72} />
      <Crate position={[1.15, 0.79, -0.3]} rotation={-0.2} size={0.5} colour={C.woodPale} />
      <Crate position={[-1.3, 0, 0.25]} rotation={-0.3} size={0.62} colour={C.woodPale} />

      {/* Barrel */}
      <group position={[-1.35, 0, -0.8]}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.31, 0.84, 18]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.9} />
        </mesh>
        {[0.16, 0.42, 0.68].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <torusGeometry args={[0.335, 0.02, 6, 20]} />
            <meshStandardMaterial color={C.metal} metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Filing cabinets along the left wall. The middle one's top drawer is open —
 * that is where the blue film sits, so it takes a walk over here to find.
 */
function FilingCabinets() {
  return (
    <group position={[-5.1, 0, -2.2]} rotation={[0, 0.06, 0]}>
      {[-1.3, 0, 1.3].map((z, idx) => (
        <group key={z} position={[0, 0, z]}>
          <Box position={[0, 0.8, 0]} size={[1.4, 1.6, 1.15]} colour={C.metal} metalness={0.35} roughness={0.55} />
          {[0.35, 0.8, 1.25].map((y) => {
            // Middle cabinet, top drawer: pulled out.
            const open = idx === 1 && y === 1.25;
            const out = open ? 0.42 : 0;
            return (
              <group key={y} position={[out, 0, 0]}>
                <Box position={[0.71, y, 0]} size={[0.04, 0.36, 1.0]} colour={C.metalDark} />
                <Box position={[0.74, y, 0]} size={[0.05, 0.06, 0.32]} colour={C.brass} metalness={0.6} roughness={0.35} />
                {open && (
                  <group>
                    {/* Drawer walls, so the open one is a container and not a floating face */}
                    <Box position={[0.5, y - 0.14, 0]} size={[0.46, 0.04, 1.0]} colour={C.metalDark} />
                    <Box position={[0.5, y, 0.49]} size={[0.46, 0.32, 0.04]} colour={C.metalDark} />
                    <Box position={[0.5, y, -0.49]} size={[0.46, 0.32, 0.04]} colour={C.metalDark} />
                    {/* Hanging files */}
                    {[-0.3, -0.1, 0.12, 0.3].map((fz) => (
                      <Box
                        key={fz}
                        position={[0.5, y + 0.02, fz]}
                        size={[0.38, 0.28, 0.03]}
                        colour={C.paperAged}
                        rotation={[0.08, 0, 0]}
                      />
                    ))}
                  </group>
                )}
              </group>
            );
          })}
        </group>
      ))}
      {/* Boxes of files stacked on top */}
      <Box position={[0, 1.78, -1.3]} size={[0.9, 0.36, 0.7]} colour={C.paperAged} rotation={[0, 0.3, 0]} roughness={1} />
      <Box position={[0.1, 1.76, 1.2]} size={[0.8, 0.32, 0.6]} colour={C.woodDark} rotation={[0, -0.2, 0]} />
      <Box position={[0.05, 1.96, 1.24]} size={[0.6, 0.08, 0.45]} colour={C.paper} rotation={[0, -0.1, 0]} />
    </group>
  );
}

/** Metal table, CRT terminal, keyboard, cable runs. */
function TerminalDesk() {
  return (
    <group position={[0.2, 0, -4.3]}>
      {/* Top surface lands at exactly y=0.7 */}
      <Box position={[0, 0.66, 0]} size={[2.4, 0.08, 1.0]} colour={C.metalDark} />
      <Box position={[-1.08, 0.31, 0]} size={[0.08, 0.62, 0.9]} colour={C.metal} />
      <Box position={[1.08, 0.31, 0]} size={[0.08, 0.62, 0.9]} colour={C.metal} />
      <Box position={[0, 0.16, -0.4]} size={[2.2, 0.06, 0.2]} colour={C.metal} />

      <group position={[-0.8, 0.7, -0.05]} rotation={[0, 0.5, 0]}>
        <Box position={[0, 0.34, 0]} size={[0.78, 0.66, 0.66]} colour={C.metalDark} />
        <Box position={[0, 0.34, 0.34]} size={[0.7, 0.58, 0.04]} colour="#20262c" />
        <mesh position={[0, 0.36, 0.37]}>
          <planeGeometry args={[0.58, 0.44]} />
          <meshStandardMaterial color={C.screen} emissive={C.screen} emissiveIntensity={1.1} roughness={0.4} />
        </mesh>
        {/* Scanlines */}
        {[-0.14, -0.07, 0, 0.07, 0.14].map((y) => (
          <mesh key={y} position={[0, 0.36 + y, 0.375]}>
            <planeGeometry args={[0.5, 0.012]} />
            <meshBasicMaterial color="#0d3f38" />
          </mesh>
        ))}
        <pointLight position={[0, 0.36, 0.7]} intensity={2.2} distance={3} color="#5ce0c8" />
        <Box position={[0, 0.02, 0.62]} size={[0.72, 0.05, 0.26]} colour={C.metal} />
        {/* Cable from the CRT down the back of the table */}
        <mesh position={[0, -0.3, -0.3]} rotation={[0.2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
          <meshStandardMaterial color="#22262c" roughness={0.9} />
        </mesh>
      </group>

      {/* Card index box on the other end */}
      <group position={[0.85, 0.7, 0]} rotation={[0, -0.3, 0]}>
        <Box position={[0, 0.11, 0]} size={[0.5, 0.22, 0.34]} colour={C.woodDark} />
        {[-0.09, -0.03, 0.03, 0.09].map((z) => (
          <Box key={z} position={[0, 0.24, z]} size={[0.42, 0.06, 0.02]} colour={C.paper} rotation={[0.12, 0, 0]} />
        ))}
      </group>
    </group>
  );
}

/** Door on the back wall, closed, with light spilling underneath. */
function Doorway() {
  return (
    <group position={[-4.3, 0, ROOM.backZ + 0.08]}>
      <Box position={[0, 1.15, 0]} size={[1.3, 2.3, 0.1]} colour={C.woodDark} />
      {/* Panelled, not a slab */}
      {[
        [0, 1.72],
        [0, 0.72],
      ].map(([x, y]) => (
        <Box key={y} position={[x, y, 0.06]} size={[0.9, 0.8, 0.03]} colour={C.wood} />
      ))}
      <Box position={[0, 2.36, 0.02]} size={[1.5, 0.12, 0.16]} colour={C.woodPale} />
      <Box position={[-0.72, 1.2, 0.02]} size={[0.14, 2.5, 0.16]} colour={C.woodPale} />
      <Box position={[0.72, 1.2, 0.02]} size={[0.14, 2.5, 0.16]} colour={C.woodPale} />
      <mesh position={[0.48, 1.05, 0.1]} castShadow>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Light under the door — somewhere else exists, which makes this a room and not a box */}
      <mesh position={[0, 0.03, 0.12]}>
        <planeGeometry args={[1.2, 0.06]} />
        <meshBasicMaterial color="#ffd9a0" />
      </mesh>
    </group>
  );
}

/** Tall window on the left wall with night outside — the room's second light source. */
function Window() {
  return (
    <group position={[-ROOM.halfWidth + 0.09, 2.3, 1.6]} rotation={[0, Math.PI / 2, 0]}>
      <Box position={[0, 0, -0.05]} size={[2.2, 2.6, 0.08]} colour="#121722" />
      {/* Glass */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[2.0, 2.4]} />
        <meshStandardMaterial color={C.glass} emissive="#2c4a6b" emissiveIntensity={0.55} roughness={0.25} />
      </mesh>
      {/* Frame and glazing bars */}
      <Box position={[0, 1.34, 0.03]} size={[2.36, 0.16, 0.14]} colour={C.woodPale} />
      <Box position={[0, -1.34, 0.03]} size={[2.36, 0.16, 0.18]} colour={C.woodPale} />
      <Box position={[-1.1, 0, 0.03]} size={[0.16, 2.84, 0.14]} colour={C.woodPale} />
      <Box position={[1.1, 0, 0.03]} size={[0.16, 2.84, 0.14]} colour={C.woodPale} />
      <Box position={[0, 0, 0.04]} size={[0.08, 2.4, 0.06]} colour={C.woodPale} />
      <Box position={[0, 0, 0.04]} size={[2.0, 0.08, 0.06]} colour={C.woodPale} />
    </group>
  );
}

/** Radiator, potted plant, coat stand, step ladder, wastebasket, newspapers. */
function Clutter() {
  return (
    <group>
      {/* Radiator on the right wall */}
      <group position={[ROOM.halfWidth - 0.22, 0.5, 2.3]}>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[0, 0, -0.6 + i * 0.15]} castShadow>
            <boxGeometry args={[0.14, 0.8, 0.1]} />
            <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        <Box position={[0, 0.44, 0]} size={[0.16, 0.06, 1.4]} colour={C.metal} metalness={0.5} />
      </group>

      {/* Potted plant */}
      <group position={[5.2, 0, 2.0]}>
        <mesh position={[0, 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.22, 0.52, 16]} />
          <meshStandardMaterial color="#8a5a44" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.53, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.05, 16]} />
          <meshStandardMaterial color="#2f2a22" roughness={1} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.16, 0.95, Math.sin(a) * 0.16]}
              rotation={[Math.cos(a) * 0.5, a, Math.sin(a) * 0.5]}
              castShadow
            >
              <coneGeometry args={[0.12, 0.85, 5]} />
              <meshStandardMaterial color={C.green} roughness={0.8} />
            </mesh>
          );
        })}
      </group>

      {/* Coat stand */}
      <group position={[-5.1, 0, 2.8]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.8, 10]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.34, 0.38, 0.1, 14]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.85} />
        </mesh>
        {[0, 1.6, 3.1, 4.7].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.16, 1.72, Math.sin(a) * 0.16]} rotation={[0, -a, 0.7]}>
            <cylinderGeometry args={[0.025, 0.025, 0.3, 8]} />
            <meshStandardMaterial color={C.woodDark} />
          </mesh>
        ))}
        {/* A coat hanging on it */}
        <Box position={[0.14, 1.15, 0.1]} size={[0.4, 1.0, 0.22]} colour="#3f4a5c" roughness={1} />
      </group>

      {/* Step ladder against the back-right */}
      <group position={[4.0, 0, -4.7]} rotation={[0, -0.5, 0]}>
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.9, 0]} rotation={[0.12, 0, 0]} castShadow>
            <boxGeometry args={[0.08, 1.8, 0.08]} />
            <meshStandardMaterial color={C.woodPale} roughness={0.85} />
          </mesh>
        ))}
        {[0.3, 0.7, 1.1, 1.5].map((y) => (
          <Box key={y} position={[0, y, y * 0.12 - 0.11]} size={[0.62, 0.05, 0.2]} colour={C.wood} />
        ))}
      </group>

      {/* Wastebasket and dropped newspapers near the desk */}
      <mesh position={[-3.9, 0.2, -2.0]} castShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.4, 12]} />
        <meshStandardMaterial color={C.metalDark} metalness={0.4} roughness={0.6} />
      </mesh>
      <Box position={[-3.55, 0.03, -1.35]} size={[0.5, 0.05, 0.36]} colour={C.paperAged} rotation={[0, 0.5, 0]} />
      <Box position={[-3.45, 0.08, -1.3]} size={[0.46, 0.04, 0.34]} colour={C.paper} rotation={[0, 0.2, 0]} />
    </group>
  );
}

/** Ceiling lamps, pipes, wall clock, framed notices. */
function Fittings() {
  return (
    <group>
      {/* Three pendant lamps down the room */}
      {[-3.2, -0.4, 2.4].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 4.72, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.56, 6]} />
            <meshStandardMaterial color={C.metalDark} />
          </mesh>
          <mesh position={[0, 4.34, 0]} castShadow>
            <coneGeometry args={[0.55, 0.42, 20, 1, true]} />
            <meshStandardMaterial color="#2c3540" roughness={0.5} metalness={0.4} side={2} />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshBasicMaterial color="#fff0d4" />
          </mesh>
          <pointLight position={[0, 4.0, 0]} intensity={26} distance={11} decay={2} color="#ffe0b8" />
        </group>
      ))}

      {/* Pipes across the ceiling */}
      {[-3.6, 3.4].map((x) => (
        <mesh key={x} position={[x, 4.78, -1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 9.5, 10]} />
          <meshStandardMaterial color={C.metal} roughness={0.5} metalness={0.55} />
        </mesh>
      ))}

      {/* Wall clock */}
      <group position={[2.0, 3.6, ROOM.backZ + 0.09]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.08, 24]} />
          <meshStandardMaterial color={C.metalDark} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.02, 24]} />
          <meshStandardMaterial color={C.paper} roughness={0.9} />
        </mesh>
        <Box position={[0, 0.08, 0.07]} size={[0.03, 0.18, 0.01]} colour="#20242a" />
        <Box position={[0.09, 0, 0.07]} size={[0.16, 0.03, 0.01]} colour="#20242a" />
      </group>

      {/* Framed notices on the back wall */}
      {[
        { x: -1.9, y: 3.2, w: 0.9, h: 1.1, tilt: 0 },
        { x: -0.7, y: 3.0, w: 0.7, h: 0.6, tilt: 0.09 },
        { x: 3.6, y: 2.6, w: 0.8, h: 1.0, tilt: -0.05 },
      ].map((f) => (
        <group key={`${f.x}-${f.y}`} position={[f.x, f.y, ROOM.backZ + 0.07]} rotation={[0, 0, f.tilt]}>
          <Box position={[0, 0, 0]} size={[f.w, f.h, 0.05]} colour={C.woodDark} />
          <mesh position={[0, 0, 0.03]}>
            <planeGeometry args={[f.w - 0.12, f.h - 0.12]} />
            <meshStandardMaterial color={C.paperAged} roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Lighting.
 *
 * Deliberately bright now: the room is searched on foot, and a player who
 * cannot see into a corner cannot tell "nothing here" from "too dark to
 * tell". The torch is a puzzle instrument, not the only way to see — it is
 * what carries the blue filter to the board, and the room reads fine without
 * it.
 *
 * Only the ceiling spot casts shadows. Every additional shadow-casting light
 * is a full depth pass per frame, and this runs on whatever laptop is wired
 * to the projector.
 */
function Lighting() {
  return (
    <group>
      <ambientLight intensity={0.75} />
      {/* three.js parses #RRGGBB only — an 8-digit hex with alpha is silently
          ignored and warns, so ground colour stays a plain six. */}
      <hemisphereLight args={["#cddcf0", "#544740", 0.9]} />
      <spotLight
        position={[0, 4.7, -1.0]}
        angle={1.0}
        penumbra={0.7}
        intensity={90}
        distance={16}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* Cool bounce from the window end */}
      <pointLight position={[-4.4, 2.4, 1.6]} intensity={16} distance={9} color="#8fb4e0" />
      {/* Fill so the front wall is not a black slab when the player turns round */}
      <pointLight position={[0, 2.6, 3.6]} intensity={12} distance={9} color="#ffe8cc" />
    </group>
  );
}

/**
 * Everything non-interactive, in one component.
 *
 * Nothing in here has an onClick, so scenery can never be mistaken for a
 * pickup — clicking a filing cabinet does nothing at all.
 */
export default function RoomScene(): ReactNode {
  return (
    <group>
      <Lighting />
      <Structure />
      <Desk />
      <Bookcase />
      <Storage />
      <FilingCabinets />
      <TerminalDesk />
      <Doorway />
      <Window />
      <Clutter />
      <Fittings />
    </group>
  );
}
