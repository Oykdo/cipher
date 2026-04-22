import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  deriveBaseTint,
  deriveSpinorPhasesAmplitudes,
  type BaseTint,
} from './holographicAvatarHelpers';

/**
 * Holographic avatar — faithful port of the Eidolon 10-layer viewer
 * (`Eidolon/src/holo/avatar_system/threejs_renderer.py`) into a compact R3F
 * component suitable for conversation headers (64px) and profile pages (120px+).
 *
 * Layer fidelity map (Eidolon name → this component):
 *   L0 Origin Key            → 7 polyhedra orbital ring
 *   L1 Inner Ring            → inner resonance torus
 *   L2 Depth Axes            → 3 vertical axes
 *   L3 Core Bloom            → animated central icosahedron
 *   L4 Outer Shell           → wireframe sphere
 *   L5 Orbit Ring            → large orbital torus (gold for founder tiers)
 *   L6 Crown Array           → 7 ceremonial cones
 *   L7 Ascendant Halo        → soft fresnel-like halo (BackSide sphere)
 *   L8 Couronne des Eons     → particle ring (count = prism_epoch, white→gold)
 *   L9 Tresses de Spin       → 7 helical point-cloud braids, colour from spinor phase
 *   L10 Reseau d'Intrication → 21 Bell arcs, quantum vs classical visual regime
 *
 * Each layer is gated by the vault's `depthLevel` (derived from `prism_epoch`
 * via `src/holo/eidolon_economy.py::depth_level_from_epoch`). Pass
 * `forceMaxDetail` to bypass the gating and show every layer for which data
 * is available (useful for showcase / post-ceremony screens).
 */

const CLASSICAL_BELL_LIMIT = 2 * Math.SQRT2; // ≈ 2.828

export function HolographicAvatar({
  seed,
  size = 64,
  tier,
  // Real crypto fingerprints — when provided, drive L8-L10.
  spinorSignature,
  bellMax,
  bellIsQuantum,
  prismHueOffset,
  depthLevel,
  createdAt: _createdAt,
  forceMaxDetail = false,
}: {
  seed: string;
  size?: number;
  tier?: string | null;
  spinorSignature?: string | null;
  bellMax?: number | null;
  bellIsQuantum?: boolean | null;
  prismHueOffset?: number | null;
  depthLevel?: number | null;
  createdAt?: string | null;
  forceMaxDetail?: boolean;
}) {
  const base = useMemo(() => deriveBaseTint(seed, tier), [seed, tier]);
  const effectiveDepth = forceMaxDetail ? 10 : (depthLevel ?? 0);
  const spinor = useMemo(
    () => (spinorSignature ? deriveSpinorPhasesAmplitudes(spinorSignature) : null),
    [spinorSignature],
  );
  const hueShift = (prismHueOffset ?? 0) / 360;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 50%, #0a0b14 0%, #05060c 80%)',
        boxShadow: base.isFounder
          ? '0 0 14px rgba(255,210,120,0.28), inset 0 0 10px rgba(255,210,120,0.15)'
          : '0 0 6px rgba(130,170,255,0.16)',
      }}
      aria-hidden
    >
      <Canvas
        camera={{ position: [0, 0, 6.2], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        dpr={[1, 1.5]}
      >
        <ambientLight intensity={0.25} />
        <pointLight position={[3, 3, 3]} intensity={0.5} color="#c0d0ff" />
        <AvatarScene
          base={base}
          hueShift={hueShift}
          depth={effectiveDepth}
          spinor={spinor}
          bellMax={bellMax ?? null}
          bellIsQuantum={bellIsQuantum ?? null}
        />
      </Canvas>
    </div>
  );
}


export function AvatarScene({
  base,
  hueShift,
  depth,
  spinor,
  bellMax,
  bellIsQuantum,
}: {
  base: BaseTint;
  hueShift: number;
  depth: number;
  spinor: { phases: number[]; amplitudes: number[] } | null;
  bellMax: number | null;
  bellIsQuantum: boolean | null;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = s.clock.getElapsedTime() * base.spinSpeed;
      groupRef.current.rotation.x = Math.sin(s.clock.getElapsedTime() * base.spinSpeed * 0.5) * 0.12;
    }
  });

  // Live hue = base hue + prism golden-angle drift (L4 glow drift, applied across all tinted layers)
  const tint = useMemo(() => new THREE.Color().setHSL((base.hue + hueShift) % 1, 0.6, 0.55), [base.hue, hueShift]);
  const accent = useMemo(() => new THREE.Color().setHSL((base.hue + hueShift + 0.18) % 1, 0.55, 0.55), [base.hue, hueShift]);
  const goldTint = useMemo(() => new THREE.Color('#ffcf6a'), []);

  return (
    <group ref={groupRef}>
      {/* L0 — always visible, orbital ring */}
      <L0Polyhedra tint={tint} />

      {depth >= 1 && <L1InnerTorus color={accent} />}
      {depth >= 2 && <L2DepthAxes />}
      {depth >= 3 && <L3CoreBloom tint={tint} />}
      {depth >= 4 && <L4OuterShell tint={tint} />}
      {depth >= 5 && <L5OrbitRing gold={base.isFounder} color={base.isFounder ? goldTint : accent} />}
      {depth >= 6 && <L6CrownArray color={tint} />}
      {depth >= 7 && <L7AscendantHalo color={tint} />}
      {depth >= 8 && <L8CouronneDesEons hueShift={hueShift} />}
      {depth >= 9 && spinor && <L9TressesDeSpin spinor={spinor} />}
      {depth >= 10 && bellMax !== null && (
        <L10ReseauIntrication bellMax={bellMax} bellIsQuantum={bellIsQuantum ?? bellMax > CLASSICAL_BELL_LIMIT} />
      )}
    </group>
  );
}

// -----------------------------------------------------------------------------
// L0 — Origin Key: 7 polyhedra in orbital ring
// -----------------------------------------------------------------------------

function L0Polyhedra({ tint }: { tint: THREE.Color }) {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => {
        const theta = (i / 7) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(theta) * 1.25, Math.sin(theta * 2) * 0.2, Math.sin(theta) * 1.25);
        return (
          <mesh key={i} position={p}>
            <tetrahedronGeometry args={[0.11]} />
            <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.7} />
          </mesh>
        );
      })}
    </>
  );
}

// -----------------------------------------------------------------------------
// L1 — Inner Ring (resonance torus at 85% radius)
// -----------------------------------------------------------------------------

function L1InnerTorus({ color }: { color: THREE.Color }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.85, 0.012, 6, 48]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// L2 — Depth Axes (3 vertical cylinders)
// -----------------------------------------------------------------------------

function L2DepthAxes() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[0, (i / 3) * Math.PI, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 2.3, 6]} />
          <meshBasicMaterial color="#d8d8ff" transparent opacity={0.3} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

// -----------------------------------------------------------------------------
// L3 — Core Bloom (animated central icosahedron)
// -----------------------------------------------------------------------------

function L3CoreBloom({ tint }: { tint: THREE.Color }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (ref.current) ref.current.scale.setScalar(0.92 + 0.06 * Math.sin(s.clock.getElapsedTime() * 2));
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.3, 1]} />
      <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={1.1} toneMapped={false} />
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// L4 — Outer Shell (wireframe sphere)
// -----------------------------------------------------------------------------

function L4OuterShell({ tint }: { tint: THREE.Color }) {
  return (
    <mesh>
      <sphereGeometry args={[1.35, 20, 20]} />
      <meshBasicMaterial color={tint} wireframe transparent opacity={0.18} toneMapped={false} />
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// L5 — Orbit Ring (large torus, gold for founder tiers)
// -----------------------------------------------------------------------------

function L5OrbitRing({ color }: { gold: boolean; color: THREE.Color }) {
  return (
    <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
      <torusGeometry args={[1.6, 0.014, 6, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} toneMapped={false} />
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// L6 — Crown Array (7 ceremonial cones at height 2.0, pointing inward)
// Reference: threejs_renderer.py:2774-2791
// -----------------------------------------------------------------------------

function L6CrownArray({ color }: { color: THREE.Color }) {
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => {
        const angle = (i / 7) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(angle) * 1.1, 1.5, Math.sin(angle) * 1.1);
        // lookAt origin: rotate cone tip toward centre
        const target = new THREE.Vector3(0, 0, 0);
        const dir = target.clone().sub(p).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        return (
          <mesh key={i} position={p} quaternion={quat}>
            <coneGeometry args={[0.06, 0.3, 6]} />
            <meshBasicMaterial color={color} transparent opacity={0.55} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

// -----------------------------------------------------------------------------
// L7 — Ascendant Halo (soft transparent sphere, BackSide for inner glow)
// Reference: threejs_renderer.py:2793 (shader-based in full renderer; here we
// approximate with a BackSide sphere — visually close at thumbnail size,
// avoids custom shaders which are expensive for many small avatars).
// -----------------------------------------------------------------------------

function L7AscendantHalo({ color }: { color: THREE.Color }) {
  return (
    <mesh>
      <sphereGeometry args={[2.05, 32, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.08} toneMapped={false} side={THREE.BackSide} />
    </mesh>
  );
}

// -----------------------------------------------------------------------------
// L8 — Couronne des Eons (particle ring, count = prism_epoch, white→gold)
// Reference: threejs_renderer.py:1330-1435 (L8 high-LOD)
// We cap at 256 particles at thumbnail size; full renderer caps at 1000.
// -----------------------------------------------------------------------------

function L8CouronneDesEons({ hueShift }: { hueShift: number }) {
  // We don't have the raw eon count here — it's implicit in the fact that
  // depth >= 8 means the vault reached the threshold. Use a fixed count that
  // looks good at avatar scale; rotation speed reflects the hue drift so
  // older vaults spin faster.
  const N = 128;
  const rotSpeed = 0.04 + hueShift * 0.12;

  const geom = useMemo(() => {
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const crownRadius = 2.4;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const wobble = Math.sin(angle * 3 + i * 0.1) * 0.08;
      pos[i * 3] = Math.cos(angle) * crownRadius;
      pos[i * 3 + 1] = wobble;
      pos[i * 3 + 2] = Math.sin(angle) * crownRadius;
      const ageRatio = i / (N - 1);
      // HSL: hue 0→45° (white→gold), saturation 0→1
      const c = new THREE.Color().setHSL((ageRatio * 45) / 360, ageRatio, 1 - ageRatio * 0.2);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = s.clock.getElapsedTime() * rotSpeed;
      groupRef.current.position.y = Math.sin(s.clock.getElapsedTime() * 0.5) * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <points geometry={geom}>
        <pointsMaterial
          size={0.045}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

// -----------------------------------------------------------------------------
// L9 — Tresses de Spin (7 helical point-cloud braids from spinor signature)
// Reference: threejs_renderer.py:1438-1543
// -----------------------------------------------------------------------------

function L9TressesDeSpin({ spinor }: { spinor: { phases: number[]; amplitudes: number[] } }) {
  const braids = useMemo(() => {
    const keyRadius = 1.25;
    const braidHelixRadius = 0.18;
    const SEGMENTS = 60;
    return spinor.phases.map((phase, i) => {
      const amplitude = Math.max(0, Math.min(1, spinor.amplitudes[i]));
      const twists = Math.max(2, Math.min(12, Math.floor(amplitude * 20)));
      const startAngle = (i / 7) * Math.PI * 2;
      const hue = ((phase / (Math.PI * 2)) + 1) % 1;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.7);
      const pos = new Float32Array((SEGMENTS + 1) * 3);
      for (let s = 0; s <= SEGMENTS; s++) {
        const t = s / SEGMENTS;
        const dist = keyRadius * (1 - t);
        const helixAngle = startAngle + t * twists * Math.PI * 2;
        const helixR = braidHelixRadius * (1 - t * 0.7);
        pos[s * 3] = Math.cos(helixAngle) * helixR + Math.cos(startAngle) * dist;
        pos[s * 3 + 1] = (t - 0.5) * 0.3 + Math.sin(helixAngle) * helixR * 0.15;
        pos[s * 3 + 2] = Math.sin(helixAngle) * helixR + Math.sin(startAngle) * dist;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return { color, geom };
    });
  }, [spinor]);

  const groupRef = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = s.clock.getElapsedTime() * 0.08;
      const breath = 1 + Math.sin(s.clock.getElapsedTime() * 0.6) * 0.03;
      groupRef.current.scale.setScalar(breath);
    }
  });

  return (
    <group ref={groupRef}>
      {braids.map((b, i) => (
        <points key={i} geometry={b.geom}>
          <pointsMaterial
            color={b.color}
            size={0.035}
            transparent
            opacity={0.75}
            sizeAttenuation
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      ))}
    </group>
  );
}

// -----------------------------------------------------------------------------
// L10 — Reseau d'Intrication (21 Bell arcs, quantum vs classical)
// Reference: threejs_renderer.py:1545-1698
// -----------------------------------------------------------------------------

function L10ReseauIntrication({ bellMax, bellIsQuantum: _bellIsQuantum }: { bellMax: number; bellIsQuantum: boolean }) {
  const arcs = useMemo(() => {
    const keyRadius = 1.25;
    const polyPositions: THREE.Vector3[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      polyPositions.push(new THREE.Vector3(Math.cos(angle) * keyRadius, Math.sin(angle * 2) * 0.2, Math.sin(angle) * keyRadius));
    }

    // Deterministic per-pair spread, scaled by the real max violation.
    // Mirrors the bellHash pattern in threejs_renderer.py:1577-1586.
    const pairHash = (i: number, j: number) => {
      let h = 0;
      const s = `pair_${i}_${j}_${bellMax.toFixed(4)}`;
      for (let c = 0; c < s.length; c++) h = ((h << 5) - h + s.charCodeAt(c)) | 0;
      const spread = 0.6 + ((Math.abs(h) % 10000) / 10000) * 0.4;
      return bellMax * spread;
    };

    const out: { geom: THREE.BufferGeometry; color: THREE.Color; opacity: number; violation: number; isQuantum: boolean; nodePos?: THREE.Vector3; strength: number }[] = [];
    const quantumColor = new THREE.Color(0x00ffff);
    const classicalColor = new THREE.Color(0x443333);
    const superQuantumColor = new THREE.Color(0xff00ff);

    for (let i = 0; i < 7; i++) {
      for (let j = i + 1; j < 7; j++) {
        const violation = pairHash(i, j);
        const isQuantum = violation > CLASSICAL_BELL_LIMIT;
        const strength = Math.min(1, Math.max(0, (violation - 1.5) / 1.7));

        const start = polyPositions[i];
        const end = polyPositions[j];
        const mid = start.clone().add(end).multiplyScalar(0.5);
        mid.y += 0.3 + strength * 0.9;

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const pts = curve.getPoints(20);
        const geom = new THREE.BufferGeometry().setFromPoints(pts);

        let color: THREE.Color;
        if (violation > 3.0) {
          color = superQuantumColor.clone();
        } else if (isQuantum) {
          color = quantumColor.clone().lerp(superQuantumColor, (violation - CLASSICAL_BELL_LIMIT) / 0.4);
        } else {
          color = classicalColor.clone().lerp(quantumColor, strength);
        }

        out.push({
          geom,
          color,
          opacity: isQuantum ? 0.7 : 0.15,
          violation,
          isQuantum,
          nodePos: isQuantum ? mid : undefined,
          strength,
        });
      }
    }
    return out;
  }, [bellMax]);

  const groupRef = useRef<THREE.Group>(null);
  const arcRefs = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const nodeRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((s) => {
    const t = s.clock.getElapsedTime();
    if (groupRef.current) groupRef.current.rotation.y = t * 0.05;
    arcs.forEach((arc, idx) => {
      if (!arc.isQuantum) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + arc.violation * 2);
      const mat = arcRefs.current[idx];
      if (mat) mat.opacity = arc.opacity * (0.6 + pulse * 0.4);
      const node = nodeRefs.current[idx];
      if (node) {
        node.scale.setScalar(1 + pulse * 0.4);
        const nodeMat = node.material as THREE.MeshBasicMaterial;
        nodeMat.opacity = 0.4 + pulse * 0.4;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {arcs.map((arc, idx) => {
        const lineMat = new THREE.LineBasicMaterial({
          color: arc.color,
          transparent: true,
          opacity: arc.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        arcRefs.current[idx] = lineMat;
        const line = new THREE.Line(arc.geom, lineMat);
        return (
          <group key={idx}>
            <primitive object={line} />
            {arc.nodePos && (
              <mesh
                ref={(el) => {
                  nodeRefs.current[idx] = el;
                }}
                position={arc.nodePos}
              >
                <sphereGeometry args={[0.05 + arc.strength * 0.05, 8, 8]} />
                <meshBasicMaterial
                  color={arc.color}
                  transparent
                  opacity={0.6}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
