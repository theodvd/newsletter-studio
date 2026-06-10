"use client";

import { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  Float,
  MeshTransmissionMaterial,
  Sparkles,
} from "@react-three/drei";

/**
 * Scène 3D de la landing : cristal de glace en réfraction temps réel.
 * - icosaèdre + MeshTransmissionMaterial (ior 1.31 = indice de la glace)
 * - rotation lente continue + flottement + parallaxe souris (lerp doux)
 * - poussière glacée (Sparkles)
 * Chargé en dynamic import (ssr: false), uniquement sur /login.
 */

function Crystal() {
  const tilt = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (spin.current) {
      spin.current.rotation.y += delta * 0.18;
      spin.current.rotation.z += delta * 0.04;
    }
    if (tilt.current) {
      // Parallaxe souris, amortie pour rester organique
      tilt.current.rotation.x = THREE.MathUtils.lerp(
        tilt.current.rotation.x,
        state.pointer.y * -0.25,
        0.05
      );
      tilt.current.rotation.y = THREE.MathUtils.lerp(
        tilt.current.rotation.y,
        state.pointer.x * 0.35,
        0.05
      );
    }
  });

  return (
    <group ref={tilt} position={[0, 0.5, 0]}>
      <Float speed={1.4} rotationIntensity={0.25} floatIntensity={0.9}>
        <mesh ref={spin} scale={1.85}>
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
      <Sparkles count={80} scale={8} size={2.2} speed={0.25} color="#bfe3ff" opacity={0.55} />
      <Sparkles count={30} scale={4} size={4} speed={0.15} color="#ffffff" opacity={0.35} />
    </group>
  );
}

export default function IceScene() {
  return (
    <Canvas
      dpr={[1, 1.8]}
      camera={{ position: [0, 0, 6], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      style={{ pointerEvents: "none" }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} color="#dff1ff" />
      <directionalLight position={[-5, -2, -4]} intensity={0.5} color="#7cc6ff" />
      <Environment preset="city" />
      <Crystal />
    </Canvas>
  );
}
