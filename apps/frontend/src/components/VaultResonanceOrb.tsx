import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface VaultResonanceOrbProps {
  /** Vault resonance score 0-100 (activity → yield bonus) */
  resonance: number;
  /** Vault operational entropy 0-100 (inactivity → yield penalty) */
  entropy: number;
  /** Whether this vault holds a Rosetta Stone (x1.2 yield) */
  rosettaBonus?: boolean;
  /** Canvas diameter in pixels */
  size?: number;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Interpolate between two hex colors by t ∈ [0,1] */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const COLOR_RESONANCE_HIGH = 0x00e5ff; // quantum-cyan
const COLOR_RESONANCE_MID  = 0x0ea5e9;
const COLOR_RESONANCE_LOW  = 0x475569; // slate
const COLOR_ENTROPY_TINT   = 0xd946ef; // magenta-trust
const COLOR_ROSETTA_GOLD   = 0xfbbf24;

function resonanceColor(resonance: number): number {
  if (resonance >= 60) return lerpColor(COLOR_RESONANCE_MID, COLOR_RESONANCE_HIGH, (resonance - 60) / 40);
  if (resonance >= 30) return lerpColor(COLOR_RESONANCE_LOW, COLOR_RESONANCE_MID, (resonance - 30) / 30);
  return COLOR_RESONANCE_LOW;
}

// ---------------------------------------------------------------------------
// Simplex-like noise (fast, inline, no deps)
// ---------------------------------------------------------------------------

function hash(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >> 13)) * 1103515245;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);

  const n000 = hash(ix, iy, iz);
  const n100 = hash(ix + 1, iy, iz);
  const n010 = hash(ix, iy + 1, iz);
  const n110 = hash(ix + 1, iy + 1, iz);
  const n001 = hash(ix, iy, iz + 1);
  const n101 = hash(ix + 1, iy, iz + 1);
  const n011 = hash(ix, iy + 1, iz + 1);
  const n111 = hash(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + sx * (n100 - n000);
  const nx10 = n010 + sx * (n110 - n010);
  const nx01 = n001 + sx * (n101 - n001);
  const nx11 = n011 + sx * (n111 - n011);

  const nxy0 = nx00 + sy * (nx10 - nx00);
  const nxy1 = nx01 + sy * (nx11 - nx01);

  return nxy0 + sz * (nxy1 - nxy0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VaultResonanceOrb({
  resonance,
  entropy,
  rosettaBonus = false,
  size = 64,
}: VaultResonanceOrbProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Clamp inputs
  const res = Math.max(0, Math.min(100, resonance));
  const ent = Math.max(0, Math.min(100, entropy));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---- Scene setup ----
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.z = 3.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    // ---- Lights ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);

    // ---- Core orb (icosahedron for organic feel) ----
    const orbGeo = new THREE.IcosahedronGeometry(0.85, 5);
    const basePositions = orbGeo.getAttribute('position').array.slice() as Float32Array;

    const primaryColor = resonanceColor(res);
    const orbMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      metalness: 0.4,
      roughness: 0.35,
      emissive: primaryColor,
      emissiveIntensity: 0.15 + (res / 100) * 0.25,
      transparent: true,
      opacity: 0.92,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    scene.add(orb);

    // ---- Inner glow sphere ----
    const glowGeo = new THREE.SphereGeometry(0.6, 24, 24);
    const glowMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.12 + (res / 100) * 0.15,
    });
    const glowSphere = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glowSphere);

    // ---- Orbital particles ----
    const particleCount = 40;
    const pGeo = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);
    const pAngles = new Float32Array(particleCount);
    const pRadii = new Float32Array(particleCount);
    const pSpeeds = new Float32Array(particleCount);
    const pPhases = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      pAngles[i] = Math.random() * Math.PI * 2;
      pRadii[i] = 1.05 + Math.random() * 0.4;
      pSpeeds[i] = 0.3 + Math.random() * 0.7;
      pPhases[i] = Math.random() * Math.PI * 2;
      pPositions[i * 3] = Math.cos(pAngles[i]) * pRadii[i];
      pPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      pPositions[i * 3 + 2] = Math.sin(pAngles[i]) * pRadii[i];
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

    const pMat = new THREE.PointsMaterial({
      color: rosettaBonus ? COLOR_ROSETTA_GOLD : primaryColor,
      size: 0.04,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ---- Entropy crackle ring (only visible at high entropy) ----
    const crackleGeo = new THREE.RingGeometry(0.88, 0.92, 48);
    const crackleMat = new THREE.MeshBasicMaterial({
      color: COLOR_ENTROPY_TINT,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const crackleRing = new THREE.Mesh(crackleGeo, crackleMat);
    scene.add(crackleRing);

    // ---- Animation loop ----
    let frameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // -- Displacement noise (entropy drives amplitude) --
      const noiseAmp = (ent / 100) * 0.12;
      const noiseSpeed = 0.6 + (ent / 100) * 1.4;
      const positions = orbGeo.getAttribute('position');

      for (let i = 0; i < positions.count; i++) {
        const bx = basePositions[i * 3];
        const by = basePositions[i * 3 + 1];
        const bz = basePositions[i * 3 + 2];
        const n = smoothNoise(bx * 2 + t * noiseSpeed, by * 2 + t * noiseSpeed * 0.7, bz * 2);
        const displacement = 1 + (n - 0.5) * 2 * noiseAmp;
        positions.setXYZ(i, bx * displacement, by * displacement, bz * displacement);
      }
      positions.needsUpdate = true;
      orbGeo.computeVertexNormals();

      // -- Rotation (resonance speeds it up) --
      const rotSpeed = 0.003 + (res / 100) * 0.007;
      orb.rotation.y += rotSpeed;
      orb.rotation.x = Math.sin(t * 0.3) * 0.1;

      // -- Particle orbits (resonance → speed) --
      const pSpeedMult = 0.5 + (res / 100) * 1.5;
      const pPos = pGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        const angle = pAngles[i] + t * pSpeeds[i] * pSpeedMult;
        const yOsc = Math.sin(t * 0.8 + pPhases[i]) * 0.25;
        pPos.setXYZ(
          i,
          Math.cos(angle) * pRadii[i],
          yOsc,
          Math.sin(angle) * pRadii[i],
        );
      }
      pPos.needsUpdate = true;

      // -- Entropy crackle ring --
      const crackleOpacity = Math.max(0, (ent - 30) / 70) * 0.4;
      crackleMat.opacity = crackleOpacity + Math.sin(t * 8) * crackleOpacity * 0.3;
      crackleRing.rotation.z = t * 0.5;
      crackleRing.rotation.x = Math.PI / 2 + Math.sin(t * 1.2) * 0.15;

      // -- Inner glow pulse --
      glowSphere.scale.setScalar(0.95 + Math.sin(t * 1.5) * 0.05);

      renderer.render(scene, camera);
    };

    animate();

    // ---- Cleanup ----
    return () => {
      cancelAnimationFrame(frameId);
      orbGeo.dispose();
      orbMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      pGeo.dispose();
      pMat.dispose();
      crackleGeo.dispose();
      crackleMat.dispose();
      renderer.dispose();
      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [res, ent, rosettaBonus, size]);

  // Determine CSS animation class
  const animClass = ent > 60
    ? 'vault-orb-container--flickering'
    : res > 50
      ? 'vault-orb-container--breathing'
      : '';

  // Halo class
  const haloClass = rosettaBonus
    ? 'vault-orb-halo vault-orb-halo--rosetta'
    : res >= 50
      ? 'vault-orb-halo vault-orb-halo--resonant'
      : 'vault-orb-halo vault-orb-halo--dim';

  return (
    <div
      className={`vault-orb-container ${animClass}`}
      style={{ width: size, height: size }}
    >
      <div className={haloClass} style={{ width: size + 12, height: size + 12 }} />
      <div
        ref={containerRef}
        className="vault-orb-canvas"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    </div>
  );
}
