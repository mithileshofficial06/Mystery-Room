"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import type { PlayerState } from "./MysteryRoomPlayer";

/**
 * The fluid bench: a wrist shooter, and a rack of cartridges that have mostly
 * gone off.
 *
 * Eight cartridges in the rack. Seven are spent — a smear of dried residue in
 * the bottom and nothing else. One still holds fluid. Click a spent one and it
 * crumbles and is gone for good; click the full one and it flies into the
 * shooter, seats with a click, and the shooter puts a web across the bench top
 * with a word in it.
 *
 * A WRONG PICK IS PERMANENT, and that is the whole tension of this one. The
 * cartridges do not come back. Which is fine, because you were never supposed
 * to guess: the full one is plainly full — a column of pale fluid with a bright
 * meniscus where it meets the glass — and the other seven are plainly not.
 * Anyone who walks up and looks can see which is which.
 *
 * The task is therefore a test of whether a player looks before they click,
 * and it punishes the alternative in the only way that teaches anything: by
 * quietly deleting the thing they did not look at. A team that clicks along the
 * rack from the left will destroy two perfectly identifiable empties before
 * reaching an answer that was visible from where they were standing.
 */

/** What the web spells out. Must match ROOM_SECTIONS s3 in roomTasks.ts. */
const WEB_CODE = "WEBLINE";

/**
 * Where the bench stands: flat against the front wall, behind the spawn point.
 *
 * Behind, specifically. The player starts at (0, 3.2) facing the back of the
 * room, so this is the one clue in the room that nobody finds without turning
 * round — which is the first thing a search should teach them to do.
 *
 * Turned to face into the room, so local +Z is the side the player stands on.
 */
const BENCH_AT: [number, number, number] = [-1.3, 0, 4.12];

/** Local position of each cartridge clip in the rack, and whether it is the full one. */
const SLOTS = [
  { id: "v0", x: -0.27, z: -0.1 },
  { id: "v1", x: -0.09, z: -0.1 },
  { id: "v2", x: 0.09, z: -0.1 },
  { id: "v3", x: 0.27, z: -0.1 },
  { id: "v4", x: -0.27, z: 0.08 },
  { id: "v5", x: -0.09, z: 0.08 },
  { id: "v6", x: 0.09, z: 0.08 },
  { id: "v7", x: 0.27, z: 0.08 },
];

/** The one with fluid in it. Back row, third along — not an end, not the middle. */
const FULL_ID = "v2";

/** Local frame of the rack, and of the shooter the cartridge flies to. */
const RACK_AT: [number, number, number] = [-0.42, 0.9, 0.02];
const SHOOTER_AT: [number, number, number] = [0.46, 0.9, 0.04];
/** Where a seated cartridge sits inside the shooter, relative to the shooter. */
const SEAT_AT = new Vector3(0, 0.055, -0.02);

const C = {
  wood: "#6a4c2f",
  woodPale: "#a5825a",
  metal: "#818995",
  metalDark: "#4d545f",
  brass: "#c39b52",
  glass: "#9fbdd0",
  fluid: "#bfe8ff",
  residue: "#463c30",
  web: "#e8f1f8",
};

interface Props {
  dragRef: MutableRefObject<PlayerState>;
  /** True once the web has been read. The bench comes back webbed, not reset. */
  found: boolean;
  onNote: (text: string) => void;
  onFound: () => void;
}

export default function WebBench({ dragRef, found, onNote, onFound }: Props) {
  /** Cartridges clicked and destroyed. They do not come back. */
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  /** The full cartridge is out of the rack and on its way to the shooter. */
  const [loaded, setLoaded] = useState(found);
  const [fired, setFired] = useState(found);

  // The shooter takes a beat to charge before it fires. Long enough to read as
  // cause and effect, short enough that nobody wonders whether it worked.
  useEffect(() => {
    if (!loaded || fired) return;
    const t = setTimeout(() => {
      setFired(true);
      onFound();
    }, 780);
    return () => clearTimeout(t);
  }, [loaded, fired, onFound]);

  function take(id: string) {
    if (id === FULL_ID) {
      if (loaded) return;
      setLoaded(true);
      onNote("The cartridge seats in the shooter with a click. Something is charging.");
      return;
    }
    if (gone.has(id)) return;
    setGone((prev) => new Set(prev).add(id));
    onNote("Dried out years ago. The cartridge crumbles to nothing in your hand.");
  }

  return (
    <group position={BENCH_AT} rotation={[0, Math.PI, 0]}>
      <Bench />

      {/* The rack, and what is left in it */}
      <group position={RACK_AT}>
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <boxGeometry args={[0.66, 0.04, 0.28]} />
          <meshStandardMaterial color={C.wood} roughness={0.9} />
        </mesh>
        {SLOTS.map((s) => (
          <group key={s.id} position={[s.x, 0.04, s.z]}>
            {/* The clip stays whether or not the cartridge does. An empty clip
                is how a player knows they have already been here. */}
            <mesh position={[0, 0.03, 0]}>
              <torusGeometry args={[0.032, 0.005, 6, 14]} />
              <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.03, 14]} />
              <meshStandardMaterial color={gone.has(s.id) ? "#2a241c" : "#3a3128"} roughness={1} />
            </mesh>

            {!gone.has(s.id) && !(s.id === FULL_ID && loaded) && (
              <Cartridge
                full={s.id === FULL_ID}
                dragRef={dragRef}
                onTake={() => take(s.id)}
              />
            )}
          </group>
        ))}
      </group>

      {/* The shooter, and the cartridge once it is on its way in */}
      <group position={SHOOTER_AT}>
        <Shooter charged={loaded} fired={fired} />
      </group>
      {loaded && (
        <FlyingCartridge
          from={[RACK_AT[0] + (SLOTS.find((s) => s.id === FULL_ID)?.x ?? 0), RACK_AT[1] + 0.11, RACK_AT[2] + (SLOTS.find((s) => s.id === FULL_ID)?.z ?? 0)]}
          to={[SHOOTER_AT[0] + SEAT_AT.x, SHOOTER_AT[1] + SEAT_AT.y, SHOOTER_AT[2] + SEAT_AT.z]}
          instant={found}
        />
      )}

      {fired && <Web />}
    </group>
  );
}

/** Workbench: top, legs, a vice, and a pegboard of tools on the wall behind. */
function Bench() {
  return (
    <group>
      <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.06, 0.7]} />
        <meshStandardMaterial color={C.woodPale} roughness={0.9} />
      </mesh>
      {/* Scarred second layer, so the top is not one clean plank */}
      <mesh position={[0.1, 0.913, 0.06]} rotation={[-Math.PI / 2, 0, 0.02]}>
        <planeGeometry args={[1.4, 0.4]} />
        <meshStandardMaterial color="#94734f" roughness={1} />
      </mesh>

      {[-0.8, 0.8].map((x) =>
        [-0.28, 0.28].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.43, z]} castShadow>
            <boxGeometry args={[0.08, 0.86, 0.08]} />
            <meshStandardMaterial color={C.wood} roughness={0.9} />
          </mesh>
        ))
      )}
      {/* Stretchers and a lower shelf with tins on it */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[1.7, 0.05, 0.62]} />
        <meshStandardMaterial color={C.wood} roughness={0.9} />
      </mesh>
      {[-0.5, -0.28, 0.62].map((x) => (
        <mesh key={x} position={[x, 0.31, -0.02]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.12, 12]} />
          <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.55} />
        </mesh>
      ))}

      {/* Bench vice, bolted to the near left corner */}
      <group position={[-0.72, 0.94, 0.2]} rotation={[0, 0.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.16, 0.1, 0.1]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.11, 0.01, 0]} castShadow>
          <boxGeometry args={[0.06, 0.12, 0.11]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.22, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
          <meshStandardMaterial color={C.metal} metalness={0.65} roughness={0.4} />
        </mesh>
      </group>

      {/* Pegboard on the wall behind, with a rack of tools */}
      <group position={[0, 1.55, -0.44]}>
        <mesh>
          <boxGeometry args={[1.6, 0.9, 0.03]} />
          <meshStandardMaterial color="#4a3f33" roughness={0.95} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[-0.6 + i * 0.2, 0.24, 0.03]} castShadow>
            <boxGeometry args={[0.02, 0.26 + (i % 3) * 0.06, 0.02]} />
            <meshStandardMaterial color={i % 2 ? C.metal : C.brass} metalness={0.6} roughness={0.45} />
          </mesh>
        ))}
        {[-0.4, 0.0, 0.4].map((x) => (
          <mesh key={x} position={[x, -0.18, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.07, 0.008, 6, 16]} />
            <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        {/* Schematic pinned in the corner */}
        <mesh position={[0.62, -0.16, 0.025]} rotation={[0, 0, -0.06]}>
          <planeGeometry args={[0.3, 0.38]} />
          <meshStandardMaterial color="#cfd8e6" roughness={1} />
        </mesh>
      </group>

      {/* A lamp clamped to the bench, so the rack is legible without the torch.
          Turned down from where it started: at full it blew the bench top out
          to near-white and took the contrast between a full tube and an empty
          one with it. */}
      <pointLight position={[0.1, 1.3, 0.1]} intensity={3.0} distance={2.6} decay={2} color="#ffe6bc" />
    </group>
  );
}

/**
 * One cartridge in the rack.
 *
 * Spent and full are the same object with one difference: how much is in it.
 * That is the entire tell, and it is left as a lighting problem rather than a
 * colour-coded one — a bright rim where liquid meets glass. Nothing about the
 * glass, the collar or the clip differs, so there is no way to shortcut it
 * except by looking.
 */
function Cartridge({
  full,
  dragRef,
  onTake,
}: {
  full: boolean;
  dragRef: MutableRefObject<PlayerState>;
  onTake: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={[0, 0.065, 0]}
      onClick={(e) => {
        e.stopPropagation();
        // A look-drag that starts and ends over this cartridge would otherwise
        // arrive here as a click — see Player's doc comment.
        if (dragRef.current.moved) return;
        onTake();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <CartridgeModel full={full} />
      {/* Click target. The glass is 5cm across and this is played on a trackpad. */}
      <mesh>
        <cylinderGeometry args={[0.045, 0.045, 0.17, 10]} />
        <meshBasicMaterial transparent opacity={hovered ? 0.16 : 0} color="#ffd479" />
      </mesh>
    </group>
  );
}

/** The cartridge body, shared by the rack copy and the one in flight. */
function CartridgeModel({ full }: { full: boolean }) {
  return (
    <group>
      {/* Glass. Thin enough to see through — the contents are the whole point,
          and at the opacity glass "should" have they were a grey blur. */}
      <mesh castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.13, 14]} />
        <meshStandardMaterial color={C.glass} transparent opacity={0.2} roughness={0.1} metalness={0.1} />
      </mesh>
      {/* What is left inside */}
      {full ? (
        <group>
          {/* Faintly self-lit. Not because web fluid glows, but because this
              rack lives in the darkest half of the room and a column of pale
              liquid lit only by a clamp lamp came out the same grey as an
              empty tube. */}
          <mesh position={[0, -0.012, 0]}>
            <cylinderGeometry args={[0.0245, 0.0245, 0.098, 14]} />
            <meshStandardMaterial
              color={C.fluid}
              emissive="#4d93bd"
              emissiveIntensity={0.5}
              roughness={0.12}
            />
          </mesh>
          {/* The meniscus: a bright disc where the fluid stops. */}
          <mesh position={[0, 0.038, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.0245, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={2} />
          </mesh>
        </group>
      ) : (
        // A scrape of dried residue in the bottom, and nothing else. Dark, so
        // an empty tube reads as empty rather than as half full of something.
        <mesh position={[0, -0.059, 0]}>
          <cylinderGeometry args={[0.0245, 0.0245, 0.006, 14]} />
          <meshStandardMaterial color={C.residue} roughness={1} />
        </mesh>
      )}
      {/* Collars top and bottom */}
      {[-0.062, 0.062].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.031, 0.031, 0.016, 14]} />
          <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {/* Paper band round the middle */}
      <mesh>
        <cylinderGeometry args={[0.0285, 0.0285, 0.022, 14, 1, true]} />
        <meshStandardMaterial color="#ded2b6" roughness={1} side={2} />
      </mesh>
    </group>
  );
}

/**
 * The cartridge crossing the bench.
 *
 * Eased toward the seat in useFrame rather than tweened through React state:
 * it is a position that changes every frame, and nothing outside this file has
 * any reason to know where it has got to. `instant` drops it straight into the
 * seat for a bench that was already solved before this component mounted.
 */
function FlyingCartridge({
  from,
  to,
  instant,
}: {
  from: [number, number, number];
  to: [number, number, number];
  instant: boolean;
}) {
  const ref = useRef<Group>(null);
  const t = useRef(instant ? 1 : 0);

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 6);
    t.current += (1 - t.current) * k;
    const p = t.current;
    g.position.set(
      from[0] + (to[0] - from[0]) * p,
      // Lifted through an arc, so it travels over the bench rather than
      // through the vice on the way.
      from[1] + (to[1] - from[1]) * p + Math.sin(p * Math.PI) * 0.12,
      from[2] + (to[2] - from[2]) * p
    );
    g.rotation.z = (1 - p) * 1.4;
  });

  return (
    <group ref={ref}>
      <CartridgeModel full />
    </group>
  );
}

/** The wrist shooter: a cuff, a receiver for the cartridge, and a nozzle. */
function Shooter({ charged, fired }: { charged: boolean; fired: boolean }) {
  const led = useRef<Mesh>(null);

  useFrame((state) => {
    const m = led.current?.material as MeshStandardMaterial | undefined;
    if (!m) return;
    // Dead until a cartridge goes in, then a fast charge blink, then steady.
    const pulse = fired ? 1 : charged ? 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 22) : 0;
    m.emissiveIntensity = pulse * 2.4;
  });

  return (
    <group rotation={[0, -0.34, 0]}>
      {/* Cuff, lying open on the bench */}
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.062, 0.016, 8, 20, Math.PI * 1.35]} />
        <meshStandardMaterial color="#3a2f2a" roughness={0.9} />
      </mesh>
      {/* Receiver block the cartridge seats into */}
      <mesh position={[0, 0.05, -0.02]} castShadow>
        <boxGeometry args={[0.09, 0.06, 0.07]} />
        <meshStandardMaterial color={C.metalDark} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.082, -0.02]}>
        <cylinderGeometry args={[0.032, 0.032, 0.012, 14]} />
        <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Nozzle, pointing across the bench */}
      <mesh position={[0, 0.05, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.02, 0.08, 12]} />
        <meshStandardMaterial color={C.metal} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Charge lamp */}
      <mesh ref={led} position={[0.05, 0.06, 0.0]}>
        <sphereGeometry args={[0.009, 8, 8]} />
        <meshStandardMaterial color="#c8352f" emissive="#ff3b30" emissiveIntensity={0} roughness={0.4} />
      </mesh>
      {/* Trigger paddle under the palm */}
      <mesh position={[0, 0.012, 0.03]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.03, 0.008, 0.03]} />
        <meshStandardMaterial color="#2a2f36" roughness={0.6} />
      </mesh>
    </group>
  );
}

/**
 * The web the shooter puts across the bench, with the word in it.
 *
 * Drawn lying on the bench top and read from above, which is how the player is
 * already standing. Faded in over about a second rather than switched on: a web
 * that simply exists on the next frame reads as a rendering glitch, and the
 * whole point of this task is that the player watches it happen.
 */
function Web() {
  const strands = useRef<Group>(null);
  const t = useRef(0);

  useFrame((_state, delta) => {
    t.current = Math.min(1, t.current + delta * 1.1);
    if (!strands.current) return;
    strands.current.scale.setScalar(0.4 + t.current * 0.6);
    strands.current.traverse((o) => {
      const m = (o as Mesh).material as MeshBasicMaterial | undefined;
      if (m && "opacity" in m) m.opacity = t.current * 0.9;
    });
  });

  return (
    <group position={[0.46, 0.918, 0.16]}>
      {/* Strand widths are 8 to 10mm, not the 3 or 4 a web would really be.
          Sub-centimetre geometry seen at a glancing angle from a metre and a
          half away lands on well under a pixel and simply is not there. */}
      <group ref={strands} rotation={[-Math.PI / 2, 0, 0]}>
        {/* Radials */}
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <mesh key={i} position={[(Math.cos(a) * 0.3) / 2, (Math.sin(a) * 0.3) / 2, 0]} rotation={[0, 0, a]}>
              <planeGeometry args={[0.3, 0.009]} />
              <meshBasicMaterial color={C.web} transparent opacity={0} depthWrite={false} />
            </mesh>
          );
        })}
        {/* Rings */}
        {[0.08, 0.15, 0.22, 0.29].map((r) => (
          <mesh key={r}>
            <ringGeometry args={[r - 0.005, r + 0.005, 10]} />
            <meshBasicMaterial color={C.web} transparent opacity={0} depthWrite={false} side={2} />
          </mesh>
        ))}
        {/* Anchor lines, thrown out past the web to the edges of the bench */}
        {[0.7, 2.2, 3.9, 5.3].map((a) => (
          <mesh key={a} position={[(Math.cos(a) * 0.66) / 2, (Math.sin(a) * 0.66) / 2, 0]} rotation={[0, 0, a]}>
            <planeGeometry args={[0.66, 0.007]} />
            <meshBasicMaterial color={C.web} transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* The word, written in the web and read from above.
          Laying text flat means rotating it -90 degrees about X, which sends
          the top of the lettering to local -Z. The bench group is turned to
          face the room (Y = pi), so local -Z is world +Z — away from a player
          standing on the near side, which is the way up they need. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Text
          position={[0, 0, 0.006]}
          fontSize={0.078}
          anchorX="center"
          anchorY="middle"
          color="#ffffff"
          outlineWidth={0.004}
          outlineColor="#1b3a5c"
        >
          {WEB_CODE}
        </Text>
      </group>
    </group>
  );
}
