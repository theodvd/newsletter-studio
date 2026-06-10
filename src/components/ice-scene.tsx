"use client";

import { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Float,
  MeshTransmissionMaterial,
  Sparkles,
} from "@react-three/drei";

/**
 * Scène 3D : cristal de glace en réfraction temps réel.
 * - icosaèdre + MeshTransmissionMaterial (ior 1.31 = indice de la glace)
 * - rotation lente + flottement + parallaxe souris amortie (damp, indépendant du framerate)
 * - taille et position responsives (calculées depuis le viewport three)
 * Chargé en dynamic import (ssr: false) via CrystalBackdrop.
 */

type Align = "center" | "right";

function Crystal({ align }: { align: Align }) {
  const tilt = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();

  // Responsive : le cristal occupe ~1/4 de la largeur, borné pour ne jamais déborder
  const scale = THREE.MathUtils.clamp(viewport.width / 6.5, 0.8, 1.45);
  const x = align === "right" ? Math.min(viewport.width * 0.24, 2.4) : 0;
  const y = Math.min(0.3, viewport.height * 0.06);

  useFrame((state, delta) => {
    if (spin.current) {
      spin.current.rotation.y += delta * 0.16;
      spin.current.rotation.z += delta * 0.04;
    }
    if (tilt.current) {
      // Amortissement exponentiel : fluide et stable quel que soit le framerate
      tilt.current.rotation.x = THREE.MathUtils.damp(
        tilt.current.rotation.x,
        state.pointer.y * -0.18,
        2.2,
        delta
      );
      tilt.current.rotation.y = THREE.MathUtils.damp(
        tilt.current.rotation.y,
        state.pointer.x * 0.28,
        2.2,
        delta
      );
    }
  });

  return (
    <group ref={tilt} position={[x, y, 0]}>
      <Float speed={1.3} rotationIntensity={0.2} floatIntensity={0.7}>
        <mesh ref={spin} scale={scale}>
          <icosahedronGeometry args={[1, 0]} />
          <MeshTransmissionMaterial
            transmission={1}
            thickness={1.8}
            roughness={0.07}
            ior={1.31}
            chromaticAberration={0.35}
            anisotropy={0.25}
            distortion={0.3}
            distortionScale={0.5}
            temporalDistortion={0.12}
            color="#d8eeff"
            attenuationColor="#7cc6ff"
            attenuationDistance={2.2}
          />
        </mesh>
      </Float>
      {/* Poussière de glace en suspension */}
      <Sparkles count={70} scale={7} size={2.2} speed={0.25} color="#bfe3ff" opacity={0.5} />
      <Sparkles count={25} scale={3.5} size={4} speed={0.15} color="#ffffff" opacity={0.3} />
    </group>
  );
}

export default function IceScene({ align = "center" }: { align?: Align }) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      performance={{ min: 0.6 }}
      camera={{ position: [0, 0, 6], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: "none" }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} color="#dff1ff" />
      <directionalLight position={[-5, -2, -4]} intensity={0.5} color="#7cc6ff" />
      <Environment preset="city" />
      <Crystal align={align} />
    </Canvas>
  );
}
