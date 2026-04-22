import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

type Props = {
  phase: number;
  ratio: number;
  finalPayload?: Record<string, unknown> | null;
};

/**
 * Simplified Genesis ceremony visual — Option A "Loading élégant".
 *
 * A calm particle field shifts hue as progress advances during the full
 * ~78 s of crypto generation. The ceremony never tries to render an
 * approximation of the final hologram in-scene — that job belongs to the
 * canonical Python-generated viewer which the user opens via a separate
 * "Voir mon hologramme" link from the done screen.
 */
export default function GenesisScene({ phase, ratio, finalPayload }: Props) {
  const revealed = Boolean(finalPayload);
  const progress = revealed ? 1 : Math.min(1, ((Math.max(1, phase) - 1) + ratio) / 9);

  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      dpr={[1, 1.5]}
      style={{ background: 'radial-gradient(circle at 50% 55%, #0a0c18 0%, #04050c 70%)' }}
      onCreated={({ gl }) => {
        // Swallow context-loss into a no-op log; without preventDefault the
        // browser treats the loss as permanent and the whole ceremony goes
        // black. R3F's scene graph re-uploads geometries when the context
        // comes back so no state is lost on our side.
        const canvas = gl.domElement;
        const handleLost = (ev: Event) => {
          ev.preventDefault();
          // eslint-disable-next-line no-console
          console.warn('[genesis] WebGL context lost — browser will attempt to restore');
        };
        canvas.addEventListener('webglcontextlost', handleLost, false);
      }}
    >
      <ambientLight intensity={0.2} />
      <pointLight position={[4, 4, 4]} intensity={0.55} color="#9fb7ff" />
      <pointLight position={[-4, -2, 3]} intensity={0.35} color="#c88aff" />

      <ZenField progress={progress} converging={revealed} />
    </Canvas>
  );
}

/* -------------------------------------------------------------------------- */
/*  Zen particle field — visible during phases 1..8                           */
/* -------------------------------------------------------------------------- */

const FIELD_COUNT = 380;

function ZenField({ progress, converging }: { progress: number; converging: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const convergeRef = useRef(1);
  const origins = useMemo(() => {
    const arr = new Float32Array(FIELD_COUNT * 3);
    for (let i = 0; i < FIELD_COUNT; i++) {
      // Spherical shell, radius 3..5
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 3 + Math.random() * 2;
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  const positions = useMemo(() => origins.slice(), [origins]);

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      size: 0.03,
      color: new THREE.Color(0.7, 0.82, 1.0),
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  // Manually-created geometry/material are not auto-disposed by R3F when the
  // <points> node unmounts, so we free GPU memory here. Without this, hot-
  // reloading or route changes during the ~78 s ceremony leak WebGL contexts
  // and the browser eventually drops them with "Context Lost".
  useEffect(() => () => {
    geom.dispose();
    material.dispose();
  }, [geom, material]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (pointsRef.current) {
      pointsRef.current.rotation.y = t * 0.04;
      pointsRef.current.rotation.x = Math.sin(t * 0.08) * 0.15;
    }
    // Gentle per-particle breathing. When the ceremony finishes we let the
    // field softly converge toward the centre, giving a visual close without
    // pretending to draw the final avatar.
    const convergeTarget = converging ? 0.55 : 1;
    convergeRef.current += (convergeTarget - convergeRef.current) * 0.015;
    const convergeK = convergeRef.current;
    const attr = geom.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < FIELD_COUNT; i++) {
      const k = (1 + 0.03 * Math.sin(t * 0.5 + i * 0.13)) * convergeK;
      attr.setXYZ(
        i,
        origins[i * 3] * k,
        origins[i * 3 + 1] * k,
        origins[i * 3 + 2] * k,
      );
    }
    attr.needsUpdate = true;
    const hue = 0.62 - progress * 0.12;
    const light = converging ? 0.78 : 0.68;
    material.color.setHSL(hue, 0.55, light);
    material.opacity = 0.6 + progress * 0.35;
  });

  return (
    <points ref={pointsRef} geometry={geom} material={material} />
  );
}

