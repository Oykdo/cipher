import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { TrustStarFacet, TrustStarResponse, PrimaryColorState } from '../services/trustStar';

interface TrustStar3DProps {
  data: TrustStarResponse;
  onFacetSelect?: (facet: TrustStarFacet) => void;
}

function getPrimaryColor(color: PrimaryColorState): number {
  switch (color) {
    case 'GREEN':
      return 0x22c55e;
    case 'AMBER':
      return 0xfbbf24;
    case 'RED':
    default:
      return 0xef4444;
  }
}

// Create a 5-pointed star geometry procedurally
function createStarGeometry(outerRadius: number, innerRadius: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const points = 5;
  const angleStep = Math.PI / points;
  
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * angleStep - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  shape.closePath();
  
  const extrudeSettings = {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.1,
    bevelSegments: 3
  };
  
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

export function TrustStar3D({ data }: TrustStar3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 240;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1.5);
    directional.position.set(3, 4, 5);
    scene.add(directional);

    // Create procedural star
    const primaryColor = getPrimaryColor(data.primaryColorState);
    const starGeometry = createStarGeometry(1.2, 0.5, 0.3);
    
    // Center the geometry
    starGeometry.computeBoundingBox();
    const bbox = starGeometry.boundingBox!;
    const centerX = (bbox.max.x + bbox.min.x) / 2;
    const centerY = (bbox.max.y + bbox.min.y) / 2;
    const centerZ = (bbox.max.z + bbox.min.z) / 2;
    starGeometry.translate(-centerX, -centerY, -centerZ);
    
    const starMaterial = new THREE.MeshStandardMaterial({
      color: primaryColor,
      metalness: 0.7,
      roughness: 0.2,
      emissive: primaryColor,
      emissiveIntensity: 0.3
    });
    
    const star = new THREE.Mesh(starGeometry, starMaterial);
    star.userData.isAvatar = true;
    group.add(star);
    
    // Add glow effect with a larger transparent star behind
    const glowGeometry = createStarGeometry(1.4, 0.6, 0.1);
    glowGeometry.translate(-centerX, -centerY, -centerZ - 0.2);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glow);
    
    // Add particles around the star
    const particleCount = 50;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 1;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: primaryColor,
      size: 0.05,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);

    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      group.rotation.y += 0.005;
      // Gentle floating
      group.position.y = Math.sin(Date.now() * 0.001) * 0.1;
      // Rotate particles slowly
      particles.rotation.z += 0.002;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 320;
      const h = container.clientHeight || 240;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      starGeometry.dispose();
      starMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [data]);

  return <div ref={containerRef} className="w-full h-64" aria-hidden="true" />;
}

export default TrustStar3D;
