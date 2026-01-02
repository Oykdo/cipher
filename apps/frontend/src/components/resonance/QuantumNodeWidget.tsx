import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, type RootState } from '@react-three/fiber';
import { Environment, Float, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

export interface QuantumNodeWidgetProps {
  resonanceLevel: number; // 0..1
  isLocked: boolean;
  aetherScore: number; // raw token count; normalized internally
  stakedAmount: number;
  className?: string;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function getResonanceColor(level: number): THREE.Color {
  const l = clamp01(level);
  const color = new THREE.Color();

  if (l < 0.4) {
    const t = l / 0.4;
    return color.lerpColors(new THREE.Color('#0b0b0e'), new THREE.Color('#00e5ff'), t);
  }

  if (l < 0.8) {
    const t = (l - 0.4) / 0.4;
    return color.lerpColors(new THREE.Color('#00e5ff'), new THREE.Color('#7c3aed'), t);
  }

  const t = (l - 0.8) / 0.2;
  return color.lerpColors(new THREE.Color('#7c3aed'), new THREE.Color('#f8fafc'), t);
}

function pseudoRandom01(seed: number): number {
  const x = Math.sin(seed) * 43758.5453123;
  return x - Math.floor(x);
}

function NodeMesh({
  resonanceLevel,
  isLocked,
  detail,
  stakedAmount,
}: {
  resonanceLevel: number;
  isLocked: boolean;
  detail: number;
  stakedAmount: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const originalPositions = useRef<Float32Array | null>(null);
  const normalsFrameSkip = useRef(0);

  const baseColor = useMemo(() => getResonanceColor(resonanceLevel), [resonanceLevel]);

  // Heartbeat parameters
  const beatHz = THREE.MathUtils.lerp(0.6, 2.2, clamp01(resonanceLevel));
  const beatAmp = THREE.MathUtils.lerp(0.02, 0.1, clamp01(resonanceLevel));

  const isUnanchored = stakedAmount <= 0;
  const baseRoughness = isUnanchored ? 0.6 : 0.2;
  const baseTransmission = isUnanchored ? 0.4 : 0.9;

  useFrame((state: RootState) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const time = state.clock.getElapsedTime();
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;

    if (!originalPositions.current) {
      originalPositions.current = (positionAttr.array as Float32Array).slice();
    }

    const positions = positionAttr.array as Float32Array;
    const originals = originalPositions.current;
    const count = positions.length / 3;

    const signal = isLocked
      ? Math.sin(time * 10) * 0.5 + Math.cos(time * 23) * 0.5
      : Math.sin(time * beatHz * Math.PI * 2);

    for (let i = 0; i < count; i++) {
      const ox = originals[i * 3];
      const oy = originals[i * 3 + 1];
      const oz = originals[i * 3 + 2];

      const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
      const inv = len > 1e-6 ? 1 / len : 1;
      const nx = ox * inv;
      const ny = oy * inv;
      const nz = oz * inv;

      let displacement = signal * beatAmp;

      if (isLocked) {
        const jitterGate = pseudoRandom01(i * 12.9898 + Math.floor(time * 30) * 78.233);
        if (jitterGate > 0.82) {
          const jitter = (pseudoRandom01(i * 93.989 + time * 19.73) - 0.5) * 0.15;
          displacement += jitter;
        }
      } else {
        displacement += Math.sin(time * 2 + nx * 4) * 0.005;
      }

      positions[i * 3] = ox + nx * displacement;
      positions[i * 3 + 1] = oy + ny * displacement;
      positions[i * 3 + 2] = oz + nz * displacement;
    }

    positionAttr.needsUpdate = true;

    // Updating normals every frame is expensive; throttle lightly.
    normalsFrameSkip.current = (normalsFrameSkip.current + 1) % 2;
    if (normalsFrameSkip.current === 0) {
      geometry.computeVertexNormals();
    }

    // Locked: red alarm blink.
    const mat = materialRef.current;
    if (mat) {
      if (isLocked) {
        const blink = 0.5 + 0.5 * Math.sin(time * 8);
        mat.color.setRGB(0.2 + 0.8 * blink, 0.02, 0.08);
        mat.emissive.set('#ff0022');
        mat.emissiveIntensity = 1.5 + blink * 1.5;
        mat.roughness = 0.35;
        mat.transmission = 0.15;
      } else {
        mat.color.copy(baseColor);
        mat.emissive.set(resonanceLevel > 0.8 ? '#fbbf24' : '#000000');
        mat.emissiveIntensity = resonanceLevel > 0.8 ? 0.55 : 0.1;

        if (isUnanchored) {
          const flicker = 0.5 + 0.5 * Math.sin(time * 11.5);
          mat.roughness = THREE.MathUtils.lerp(baseRoughness, baseRoughness * 1.7, flicker);
          mat.transmission = baseTransmission;
        } else {
          mat.roughness = baseRoughness;
          mat.transmission = baseTransmission;
        }
      }
      mat.needsUpdate = false;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, detail]} />
      <meshPhysicalMaterial
        ref={materialRef}
        color={baseColor}
        emissive={'#000000'}
        emissiveIntensity={0.1}
        transmission={baseTransmission}
        opacity={1}
        metalness={0.1}
        roughness={baseRoughness}
        ior={1.5}
        thickness={0.5}
        specularIntensity={1}
        clearcoat={1}
        clearcoatRoughness={0.1}
      />
    </mesh>
  );
}

function LockedCage() {
  return (
    <mesh scale={1.06}>
      <icosahedronGeometry args={[1, 2]} />
      <meshBasicMaterial color="#ff0022" wireframe transparent opacity={0.3} />
    </mesh>
  );
}

function AetherParticles({
  aetherScore,
  isLocked,
  stakedAmount,
}: {
  aetherScore: number;
  isLocked: boolean;
  stakedAmount: number;
}) {
  const ref = useRef<THREE.Points>(null);

  const maxVisual = 5000;
  const capped = Math.max(0, Math.min(aetherScore, maxVisual));
  const density = clamp01(Math.log(1 + capped) / Math.log(1 + maxVisual));

  const count = Math.round(THREE.MathUtils.lerp(24, 240, density));
  const orbitSpeed = THREE.MathUtils.lerp(0.15, 0.85, density);

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 1.4 + pseudoRandom01(i * 11.11) * 0.4;
      const theta = pseudoRandom01(i * 17.17) * Math.PI * 2;
      const u = pseudoRandom01(i * 29.29);
      const phi = Math.acos(2 * u - 1);

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, [count]);

  const isUnanchored = stakedAmount <= 0;

  useFrame((state: RootState) => {
    const pts = ref.current;
    if (!pts) return;
    const dt = state.clock.getDelta();
    const time = state.clock.getElapsedTime();
    const instability = isUnanchored ? 0.7 + 0.6 * Math.sin(time * 6) : 1;
    pts.rotation.y += orbitSpeed * instability * dt;
    pts.rotation.x += orbitSpeed * 0.25 * instability * dt;
  });

  const particleColor = isLocked ? '#ff0022' : density > 0.8 ? '#fbbf24' : '#00e5ff';

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        size={0.05}
        sizeAttenuation
        depthWrite={false}
        opacity={isUnanchored ? 0.55 : 0.75}
        color={particleColor}
      />
    </Points>
  );
}

function Scene({
  resonanceLevel,
  isLocked,
  aetherScore,
  stakedAmount,
}: {
  resonanceLevel: number;
  isLocked: boolean;
  aetherScore: number;
  stakedAmount: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Adaptive detail: mobile-friendly.
  const detail = useMemo(() => {
    if (typeof window === 'undefined') return 4;
    const coarse = window.matchMedia?.('(max-width: 640px)').matches;
    return coarse ? 3 : 4;
  }, []);

  useFrame((state: RootState) => {
    const g = groupRef.current;
    if (!g) return;

    const targetX = state.pointer.y * 0.25;
    const targetY = state.pointer.x * 0.35;

    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, 0.08);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetY, 0.08);
  });

  return (
    <group ref={groupRef}>
      <Float floatIntensity={0.5} speed={2}>
        <NodeMesh resonanceLevel={resonanceLevel} isLocked={isLocked} detail={detail} stakedAmount={stakedAmount} />
        {isLocked && <LockedCage />}
        <AetherParticles aetherScore={aetherScore} isLocked={isLocked} stakedAmount={stakedAmount} />
      </Float>
    </group>
  );
}

export function QuantumNodeWidget({ resonanceLevel, isLocked, aetherScore, stakedAmount, className = '' }: QuantumNodeWidgetProps) {
  return (
    <div className={`w-full h-full ${className}`.trim()}>
      <Canvas camera={{ position: [0, 0, 3.2], fov: 45 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={1} color="#00e5ff" />

        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>

        <Scene resonanceLevel={resonanceLevel} isLocked={isLocked} aetherScore={aetherScore} stakedAmount={stakedAmount} />
      </Canvas>
    </div>
  );
}

export default QuantumNodeWidget;
