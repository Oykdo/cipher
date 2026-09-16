/**
 * The sphere as an orb, in WebGL, from its template's signature — the look of
 * the Eidolon visualizer (theme shell and glow, rarity aura / particles /
 * pulse, state brightness) rendered live by the GPU, from a few hundred
 * bytes of data. No image, no cache, no runtime call.
 *
 * One WebGL context for the whole grid: `OrbStage` mounts a single R3F
 * canvas, fixed over the viewport and portaled to `body`, and each
 * `SphereOrb3D` is a DOM placeholder the canvas paints into (its own scene
 * and camera, scissored to the placeholder's rect, clipped to the grid).
 * Off-screen orbs cost nothing. Motion stops under prefers-reduced-motion;
 * without WebGL, the CSS orb of custodyUi stands in.
 */

import { Component, createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal as domPortal } from "react-dom";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { SphereStatus } from "../../lib/spheres";
import { visualSpec, type SphereVisualSpec } from "../../lib/sphereVisuals";
import { SphereOrb } from "./custodyUi";

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

let webglProbe: boolean | null = null;

function webglAvailable(): boolean {
    if (webglProbe !== null) return webglProbe;
    try {
        const canvas = document.createElement("canvas");
        webglProbe = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
        webglProbe = false;
    }
    return webglProbe;
}

/** Crisp on laptop screens, bounded (~4.5 Mpx) on a 4K window: the canvas spans the viewport. */
function stageDpr(): number {
    const area = Math.max(1, window.innerWidth * window.innerHeight);
    return Math.max(1, Math.min(1.5, window.devicePixelRatio || 1, Math.sqrt(4.5e6 / area)));
}

function reducedMotion(): boolean {
    try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Stage: the placeholders register here, the canvas paints them
// ---------------------------------------------------------------------------

type Slot = { id: string; el: HTMLElement; spec: SphereVisualSpec };

class StageRegistry {
    private slots = new Map<string, Slot>();
    private listeners = new Set<() => void>();
    private snapshot: Slot[] = [];

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    getSnapshot = () => this.snapshot;
    set(slot: Slot) {
        this.slots.set(slot.id, slot);
        this.commit();
    }
    delete(id: string) {
        if (this.slots.delete(id)) this.commit();
    }
    private commit() {
        this.snapshot = [...this.slots.values()];
        this.listeners.forEach((listener) => listener());
    }
}

type StageValue = { live: boolean; animate: boolean; stage: StageRegistry | null };

const StageContext = createContext<StageValue>({ live: false, animate: false, stage: null });

class StageBoundary extends Component<{ onBroken: () => void; children: ReactNode }, { broken: boolean }> {
    state = { broken: false };
    static getDerivedStateFromError() {
        return { broken: true };
    }
    componentDidCatch() {
        this.props.onBroken();
    }
    render() {
        return this.state.broken ? null : this.props.children;
    }
}

/**
 * Wraps a grid of cards; paints every `SphereOrb3D` inside it on one canvas.
 * Falls back to the CSS orbs when WebGL is missing or the canvas throws.
 */
export function OrbStage({ children, className }: { children: ReactNode; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [broken, setBroken] = useState(false);
    const [stage] = useState(() => new StageRegistry());
    const live = !broken && webglAvailable();
    const animate = live && !reducedMotion();
    const value = useMemo(() => ({ live, animate, stage }), [live, animate, stage]);
    return (
        <StageContext.Provider value={value}>
            <div ref={ref} className={className}>
                {children}
            </div>
            {live &&
                domPortal(
                    <StageBoundary onBroken={() => setBroken(true)}>
                        <div className="custody-orb-stage" aria-hidden="true">
                            <Canvas
                                dpr={stageDpr()}
                                frameloop={animate ? "always" : "demand"}
                                gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
                                // R3F's wrapper sets `pointer-events: auto` inline (it hosts its own pointer
                                // events), which beats the stage's `none` and swallowed every click on the
                                // page: the canvas must be transparent to the pointer, it paints only.
                                style={{ pointerEvents: "none" }}
                            >
                                <StagePort stage={stage} clip={ref} animate={animate} />
                            </Canvas>
                        </div>
                    </StageBoundary>,
                    document.body,
                )}
        </StageContext.Provider>
    );
}

type ViewEntry = { el: HTMLElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera };

/** Inside the canvas: one view per registered placeholder, and the loop that paints them. */
function StagePort({ stage, clip, animate }: { stage: StageRegistry; clip: RefObject<HTMLDivElement | null>; animate: boolean }) {
    const slots = useSyncExternalStore(stage.subscribe, stage.getSnapshot);
    const gl = useThree((s) => s.gl);
    const invalidate = useThree((s) => s.invalidate);
    const views = useRef(new Map<string, ViewEntry>()).current;
    // A neutral room, once per context: what the metals and the clearcoat reflect. Lives as long as the renderer.
    const environment = useMemo(() => {
        const pmrem = new THREE.PMREMGenerator(gl);
        const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        return texture;
    }, [gl]);

    useEffect(() => {
        gl.autoClear = false;
    }, [gl]);

    // Under reduced motion the loop runs on demand: repaint when the page moves or reflows.
    useEffect(() => {
        if (animate) return;
        const repaint = () => invalidate();
        window.addEventListener("scroll", repaint, true);
        window.addEventListener("resize", repaint);
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(repaint);
        if (observer && clip.current) observer.observe(clip.current);
        return () => {
            window.removeEventListener("scroll", repaint, true);
            window.removeEventListener("resize", repaint);
            observer?.disconnect();
        };
    }, [animate, clip, invalidate]);

    useFrame(({ gl: renderer }) => {
        const canvas = renderer.domElement.getBoundingClientRect();
        renderer.setScissorTest(false);
        renderer.clear(true, true, false);
        const grid = clip.current?.getBoundingClientRect();
        const clipLeft = Math.max(canvas.left, grid?.left ?? canvas.left);
        const clipTop = Math.max(canvas.top, grid?.top ?? canvas.top);
        const clipRight = Math.min(canvas.right, grid?.right ?? canvas.right);
        const clipBottom = Math.min(canvas.bottom, grid?.bottom ?? canvas.bottom);
        for (const view of views.values()) {
            const rect = view.el.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) continue;
            const left = Math.max(rect.left, clipLeft);
            const top = Math.max(rect.top, clipTop);
            const right = Math.min(rect.right, clipRight);
            const bottom = Math.min(rect.bottom, clipBottom);
            if (right - left < 1 || bottom - top < 1) continue;
            const aspect = rect.width / rect.height;
            if (view.camera.aspect !== aspect) {
                view.camera.aspect = aspect;
                view.camera.updateProjectionMatrix();
            }
            // The viewport is the whole placeholder (so the projection holds); the scissor, its visible part.
            renderer.setViewport(rect.left - canvas.left, canvas.bottom - rect.bottom, rect.width, rect.height);
            renderer.setScissor(left - canvas.left, canvas.bottom - bottom, right - left, bottom - top);
            renderer.setScissorTest(true);
            renderer.render(view.scene, view.camera);
        }
        renderer.setScissorTest(false);
    }, 1);

    return (
        <>
            {slots.map((slot) => (
                <OrbView key={slot.id} slot={slot} views={views} environment={environment} />
            ))}
        </>
    );
}

function OrbView({ slot, views, environment }: { slot: Slot; views: Map<string, ViewEntry>; environment: THREE.Texture }) {
    const invalidate = useThree((s) => s.invalidate);
    const scene = useMemo(() => {
        const s = new THREE.Scene();
        s.environment = environment;
        return s;
    }, [environment]);
    const camera = useMemo(() => {
        const c = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
        c.position.set(0, 0, 5);
        return c;
    }, []);
    useLayoutEffect(() => {
        views.set(slot.id, { el: slot.el, scene, camera });
        invalidate();
        return () => {
            views.delete(slot.id);
            invalidate();
        };
    }, [slot, scene, camera, views, invalidate]);
    return createPortal(<Orb spec={slot.spec} />, scene);
}

// ---------------------------------------------------------------------------
// The orb
// ---------------------------------------------------------------------------

let haloTexture: THREE.Texture | null = null;

/** A soft radial disc, drawn once, tinted per orb: the aura, and each particle. */
function halo(): THREE.Texture {
    if (haloTexture) return haloTexture;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.3, "rgba(255,255,255,0.35)");
    g.addColorStop(0.7, "rgba(255,255,255,0.05)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    haloTexture = new THREE.CanvasTexture(canvas);
    return haloTexture;
}

function tinted(hex: string, spec: SphereVisualSpec): THREE.Color {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // A small per-sphere hue drift, and the state's saturation / brightness.
    const drift = (spec.seed - 0.5) * 0.06;
    c.setHSL((hsl.h + drift + 1) % 1, hsl.s * spec.state.saturation, Math.min(1, hsl.l * spec.state.brightness));
    return c;
}

function Particles({ spec }: { spec: SphereVisualSpec }) {
    const count = Math.max(0, Math.round(18 * spec.fx.particles));
    const ref = useRef<THREE.Points>(null);
    const positions = useMemo(() => {
        const arr = new Float32Array(count * 3);
        let x = spec.seed * 1000;
        const rand = () => {
            // Mulberry32 from the sphere seed: the same sphere, the same sky.
            x += 0x6d2b79f5;
            let t = x;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = 0; i < count; i++) {
            const r = 1.35 + rand() * 0.7;
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2 * rand() - 1);
            arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            arr[i * 3 + 2] = r * Math.cos(phi);
        }
        return arr;
    }, [count, spec.seed]);
    const { animate } = useContext(StageContext);
    useFrame((_, delta) => {
        if (!animate || !ref.current) return;
        ref.current.rotation.y += delta * 0.12 * (0.5 + spec.fx.orbit) * spec.state.pulseSpeed;
        ref.current.rotation.x += delta * 0.04 * spec.state.pulseSpeed;
    });
    if (count === 0) return null;
    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            {/* Pixel-sized: the canvas spans the viewport, so attenuation would scale with the window. */}
            <pointsMaterial
                map={halo()}
                color={tinted(spec.colors.glow, spec)}
                size={2.4 + 1.2 * spec.fx.sparkle}
                sizeAttenuation={false}
                transparent
                opacity={0.9 * spec.state.brightness}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}

function Accent({ spec }: { spec: SphereVisualSpec }) {
    const ref = useRef<THREE.Group>(null);
    const { animate } = useContext(StageContext);
    useFrame((_, delta) => {
        if (!animate || !ref.current) return;
        ref.current.rotation.z += delta * 0.25 * spec.state.pulseSpeed;
        ref.current.rotation.x += delta * 0.1 * spec.state.pulseSpeed;
    });
    const rim = tinted(spec.shell.rim, spec);
    switch (spec.family) {
        case "beast":
            // A spiked ring: the dragon's crown.
            return (
                <group ref={ref} rotation={[Math.PI / 3, 0, spec.seed * Math.PI]}>
                    <mesh>
                        <torusGeometry args={[1.32, 0.035, 8, 64]} />
                        <meshBasicMaterial color={rim} transparent opacity={0.8} />
                    </mesh>
                    {Array.from({ length: 6 }, (_, i) => (
                        <mesh key={i} position={[Math.cos((i / 6) * Math.PI * 2) * 1.32, Math.sin((i / 6) * Math.PI * 2) * 1.32, 0]} rotation={[0, 0, (i / 6) * Math.PI * 2 + Math.PI / 2]}>
                            <coneGeometry args={[0.07, 0.24, 4]} />
                            <meshBasicMaterial color={rim} transparent opacity={0.9} />
                        </mesh>
                    ))}
                </group>
            );
        case "wave":
            return (
                <group ref={ref} rotation={[Math.PI / 2.4, spec.seed, 0]}>
                    <mesh>
                        <torusGeometry args={[1.3, 0.025, 8, 72]} />
                        <meshBasicMaterial color={rim} transparent opacity={0.7} />
                    </mesh>
                    <mesh rotation={[0, 0.5, 0.4]}>
                        <torusGeometry args={[1.5, 0.018, 8, 72]} />
                        <meshBasicMaterial color={tinted(spec.colors.glow, spec)} transparent opacity={0.45} />
                    </mesh>
                </group>
            );
        case "monolith":
            return (
                <group ref={ref} rotation={[spec.seed, spec.seed * 2, 0]}>
                    <mesh>
                        <icosahedronGeometry args={[1.28, 1]} />
                        <meshBasicMaterial color={rim} wireframe transparent opacity={0.35} />
                    </mesh>
                </group>
            );
        case "stellar":
            return (
                <group ref={ref} rotation={[0.3, spec.seed * 3, 0.2]}>
                    <mesh>
                        <torusGeometry args={[1.45, 0.015, 6, 80]} />
                        <meshBasicMaterial color={tinted(spec.colors.glow, spec)} transparent opacity={0.5} />
                    </mesh>
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[1.62, 0.012, 6, 80]} />
                        <meshBasicMaterial color={rim} transparent opacity={0.35} />
                    </mesh>
                </group>
            );
        case "singularity":
            // A bright event horizon around a dark heart.
            return (
                <group ref={ref} rotation={[Math.PI / 2.2, 0, spec.seed]}>
                    <mesh>
                        <torusGeometry args={[1.12, 0.05, 10, 80]} />
                        <meshBasicMaterial color={tinted(spec.shell.highlight, spec)} transparent opacity={0.9} />
                    </mesh>
                </group>
            );
        default:
            return null;
    }
}

function Orb({ spec }: { spec: SphereVisualSpec }) {
    const group = useRef<THREE.Group>(null);
    const shellRef = useRef<THREE.Mesh>(null);
    const haloRef = useRef<THREE.Sprite>(null);
    const { animate } = useContext(StageContext);
    const shellColor = useMemo(() => tinted(spec.shell.shell, spec), [spec]);
    const glowColor = useMemo(() => tinted(spec.colors.glow, spec), [spec]);
    const coreColor = useMemo(() => tinted(spec.colors.primary, spec), [spec]);
    const dark = spec.family === "singularity";
    const auraScale = Math.min(3.6, 2.2 + 0.7 * spec.fx.aura * spec.state.aura);
    const phase = spec.seed * Math.PI * 2;

    useFrame((state, delta) => {
        if (!animate || !group.current) return;
        group.current.rotation.y += delta * 0.35 * spec.state.pulseSpeed;
        const t = state.clock.elapsedTime;
        const pulse = 1 + Math.sin(t * (0.8 + spec.fx.pulse * 0.6) * spec.state.pulseSpeed + phase) * 0.06 * spec.fx.pulse * spec.state.pulseSpeed;
        if (haloRef.current) haloRef.current.scale.setScalar(auraScale * pulse);
        if (shellRef.current) shellRef.current.scale.setScalar(1 + (pulse - 1) * 0.3);
    });

    return (
        <group>
            <ambientLight intensity={0.25} />
            <directionalLight position={[3, 4, 5]} intensity={2.4} color="#ffffff" />
            <pointLight position={[-3, -2, 2]} intensity={1.6} color={glowColor} />
            <pointLight position={[2, -3, -2]} intensity={0.7} color={coreColor} />
            <sprite ref={haloRef} scale={auraScale} renderOrder={-1}>
                <spriteMaterial map={halo()} color={glowColor} transparent opacity={0.55 * spec.state.brightness} depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <group ref={group} rotation={[0.2, phase, 0]}>
                <mesh ref={shellRef}>
                    <sphereGeometry args={[1, 48, 48]} />
                    <meshPhysicalMaterial
                        color={dark ? "#05030c" : shellColor}
                        metalness={spec.shell.metallic}
                        roughness={spec.shell.roughness}
                        envMapIntensity={0.9 * spec.state.brightness}
                        clearcoat={spec.shell.specular}
                        clearcoatRoughness={0.15}
                        iridescence={spec.shell.iridescence}
                        iridescenceIOR={1.6}
                        emissive={dark ? coreColor : shellColor}
                        emissiveIntensity={dark ? 0.15 : 0.25 * spec.state.brightness}
                    />
                </mesh>
                {!dark && (
                    <mesh scale={0.62}>
                        <sphereGeometry args={[1, 32, 32]} />
                        <meshBasicMaterial color={coreColor} transparent opacity={0.28 * spec.state.brightness} blending={THREE.AdditiveBlending} depthWrite={false} />
                    </mesh>
                )}
                <mesh scale={1.04}>
                    <sphereGeometry args={[1, 32, 32]} />
                    <meshBasicMaterial color={tinted(spec.shell.rim, spec)} transparent opacity={0.14 * spec.state.brightness} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
                <Accent spec={spec} />
            </group>
            <Particles spec={spec} />
        </group>
    );
}

/**
 * The orb of one sphere, sized like the CSS orb it replaces. Inside an
 * `OrbStage`; anywhere else, or without WebGL, the CSS orb is shown.
 */
export function SphereOrb3D({ sphere, size = 72 }: { sphere: SphereStatus; size?: number }) {
    const { live, stage } = useContext(StageContext);
    const spec = useMemo(() => visualSpec(sphere), [sphere]);
    const ref = useRef<HTMLDivElement>(null);
    const id = useId();
    useLayoutEffect(() => {
        if (!live || !stage || !ref.current) return;
        stage.set({ id, el: ref.current, spec });
        return () => stage.delete(id);
    }, [live, stage, id, spec]);
    if (!live) {
        return <SphereOrb rarity={sphere.rarity} burned={sphere.burned} />;
    }
    return <div ref={ref} className="custody-orb3d" style={{ width: size, height: size }} title={spec.form ?? undefined} aria-hidden="true" />;
}
