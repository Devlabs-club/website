import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas, extend, useThree, useFrame } from '@react-three/fiber';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { Environment, Lightformer } from '@react-three/drei';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import { MomentumPoster } from './MomentumPoster';
import { toPng } from 'html-to-image';

extend({ MeshLineGeometry, MeshLineMaterial });

// The Band Component (Physics & Lanyard)
function Band({ textureMap }: { textureMap: THREE.Texture | null }) {
  const band = useRef<THREE.Mesh>(null);
  const fixed = useRef<any>(null);
  const j1 = useRef<any>(null);
  const j2 = useRef<any>(null);
  const j3 = useRef<any>(null);
  const card = useRef<any>(null);

  const vec = new THREE.Vector3();
  const ang = new THREE.Vector3();
  const rot = new THREE.Vector3();
  const dir = new THREE.Vector3();

  const { width, height } = useThree((state) => state.size);
  const [curve] = useState(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
  ]));

  const [dragged, drag] = useState<THREE.Vector3 | false>(false);
  const [hovered, hover] = useState(false);

  // Rope joints to simulate the lanyard swinging
  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1.5]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1.5]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1.5]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.6, 0]]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
    } else {
      document.body.style.cursor = 'auto';
    }
  }, [hovered, dragged]);

  useFrame((state) => {
    if (dragged && card.current) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      card.current.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }
    
    if (fixed.current && j1.current && j2.current && j3.current && band.current) {
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.translation());
      curve.points[2].copy(j1.current.translation());
      curve.points[3].copy(fixed.current.translation());
      // @ts-ignore
      band.current.geometry.setPoints(curve.getPoints(32));
    }

    if (card.current) {
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      // Dampen the rotation heavily to keep it facing the user
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.5, z: ang.z });
    }
  });

  // Poster aspect ratio is 2/3
  const cardWidth = 2.4;
  const cardHeight = cardWidth * 1.5;

  return (
    <>
      <RigidBody ref={fixed} type="fixed" position={[0, 4, 0]} />
      <RigidBody position={[0.5, 3, 0]} ref={j1}>
        <BallCollider args={[0.1]} />
      </RigidBody>
      <RigidBody position={[1, 2, 0]} ref={j2}>
        <BallCollider args={[0.1]} />
      </RigidBody>
      <RigidBody position={[1.5, 1, 0]} ref={j3}>
        <BallCollider args={[0.1]} />
      </RigidBody>

      <RigidBody
        ref={card}
        position={[0, 0, 0]}
        type={dragged ? 'kinematicPosition' : 'dynamic'}
      >
        <CuboidCollider args={[cardWidth / 2, cardHeight / 2, 0.05]} />
        <mesh
          onPointerOver={() => hover(true)}
          onPointerOut={() => hover(false)}
          onPointerUp={(e) => {
            if ('releasePointerCapture' in e.target && typeof (e.target as any).releasePointerCapture === 'function') {
              try {
                (e.target as any).releasePointerCapture(e.pointerId);
              } catch (err) {}
            }
            drag(false);
          }}
          onPointerDown={(e) => {
            if ('setPointerCapture' in e.target && typeof (e.target as any).setPointerCapture === 'function') {
              try {
                (e.target as any).setPointerCapture(e.pointerId);
              } catch (err) {}
            }
            drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())));
          }}
        >
          <planeGeometry args={[cardWidth, cardHeight]} />
          {textureMap ? (
            <meshPhysicalMaterial
              map={textureMap}
              clearcoat={1}
              clearcoatRoughness={0.15}
              metalness={0.1}
              roughness={0.3}
              side={THREE.DoubleSide}
            />
          ) : (
            <meshBasicMaterial color="#EAE5D9" side={THREE.DoubleSide} />
          )}
        </mesh>
      </RigidBody>

      <mesh ref={band}>
        {/* @ts-ignore */}
        <meshLineGeometry />
        {/* @ts-ignore */}
        <meshLineMaterial color="#f97316" resolution={[width, height]} lineWidth={1.5} />
      </mesh>
    </>
  );
}

// Wrapper to handle DOM to Texture conversion
export default function Momentum3DBadge({ 
  participantName, 
  startupName, 
  group 
}: { 
  participantName: string, 
  startupName: string, 
  group: string 
}) {
  const hiddenPosterRef = useRef<HTMLDivElement>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    // Wait for the DOM and custom fonts/images to be fully loaded before snapshotting
    const timer = setTimeout(async () => {
      if (hiddenPosterRef.current) {
        try {
          const dataUrl = await toPng(hiddenPosterRef.current, {
            quality: 1.0,
            pixelRatio: 3, // High resolution for the 3D texture
            cacheBust: true,
          });
          
          const tex = new THREE.TextureLoader().load(dataUrl);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 16;
          setTexture(tex);
        } catch (err) {
          console.error("Failed to generate texture for 3D badge", err);
        }
      }
    }, 1500); // 1.5s delay to ensure fonts and background images are fully loaded and rendered
    
    return () => clearTimeout(timer);
  }, [participantName, startupName, group]);

  return (
    <div className="w-full h-full relative">
      {/* Hidden DOM element strictly for snapshotting */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
        <div style={{ width: '800px', height: '1200px' }}>
          <MomentumPoster
            ref={hiddenPosterRef}
            participantName={participantName}
            startupName={startupName}
            imageSrc={`/badges/${group.toLowerCase()}.png`}
            showDownloadBtn={false}
          />
        </div>
      </div>

      {!texture && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500/20 border-t-orange-500" />
        </div>
      )}

      <Canvas camera={{ position: [0, 0, 10], fov: 40 }} className="touch-none">
        <ambientLight intensity={Math.PI} />
        <Physics gravity={[0, -20, 0]}>
          <Band textureMap={texture} />
        </Physics>
        <Environment preset="city" blur={0.5}>
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Canvas>
    </div>
  );
}
