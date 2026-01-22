import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

// Individual food plane that rotates
function FoodPlane({ texture, position, rotationOffset }) {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      // Smooth rotation around Y axis
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5 + rotationOffset;
      // Gentle floating effect
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + rotationOffset) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[1.2, 1.2]} />
      <meshStandardMaterial 
        map={texture} 
        side={THREE.DoubleSide}
        transparent={true}
        alphaTest={0.1}
      />
    </mesh>
  );
}

// Rotating carousel group
function CarouselGroup({ textures }) {
  const groupRef = useRef();
  
  useFrame((state) => {
    if (groupRef.current) {
      // Smooth continuous rotation
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  const radius = 2.5;
  const itemCount = textures.length;
  
  // Calculate positions dynamically based on number of items
  const getPosition = (index) => {
    const angle = (index / itemCount) * Math.PI * 2;
    return [
      Math.sin(angle) * radius,
      0,
      Math.cos(angle) * radius
    ];
  };

  return (
    <group ref={groupRef}>
      {textures.map((texture, index) => (
        <FoodItem 
          key={index}
          texture={texture}
          position={getPosition(index)}
          index={index}
        />
      ))}
    </group>
  );
}

// Single food item with 3D depth
function FoodItem({ texture, position, index }) {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      // Counter-rotate to always face camera
      meshRef.current.rotation.y = -state.clock.elapsedTime * 0.3;
      // Subtle floating
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8 + index) * 0.15;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <circleGeometry args={[1.1, 32]} />
      <meshStandardMaterial 
        map={texture} 
        side={THREE.DoubleSide}
        transparent={true}
        alphaTest={0.1}
      />
    </mesh>
  );
}

// Ambient particles for atmosphere
function Particles() {
  const particlesRef = useRef();
  
  const particles = useMemo(() => {
    const positions = [];
    for (let i = 0; i < 50; i++) {
      positions.push(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 8
      );
    }
    return new Float32Array(positions);
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.length / 3}
          array={particles}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#ffffff"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

// Main 3D Scene
function Scene({ images }) {
  // Load all textures using drei's useTexture (more reliable)
  const textures = useTexture(images);
  // Ensure textures is always an array
  const textureArray = Array.isArray(textures) ? textures : [textures];

  return (
    <>
      {/* Ambient light for base illumination - increased for brightness */}
      <ambientLight intensity={1.5} />
      
      {/* Main directional light (sun-like) - increased intensity */}
      <directionalLight 
        position={[5, 5, 5]} 
        intensity={2.5} 
        castShadow
        color="#ffffff"
      />
      
      {/* Front light for better visibility */}
      <directionalLight 
        position={[0, 0, 5]} 
        intensity={1.5} 
        color="#ffffff"
      />
      
      {/* Accent light from below */}
      <pointLight 
        position={[0, -3, 0]} 
        intensity={0.5} 
        color="#ffffff"
      />
      
      {/* Back light for rim effect */}
      <pointLight 
        position={[0, 2, -5]} 
        intensity={0.5} 
        color="#ffd93d"
      />

      {/* Rotating carousel */}
      <CarouselGroup textures={textureArray} />
      
      {/* Floating particles */}
      <Particles />
    </>
  );
}

// Loading fallback inside Canvas
function Loader() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshBasicMaterial color="#ffffff" wireframe />
    </mesh>
  );
}

// Main component export
export default function FoodCarousel3D({ images }) {
  return (
    <div className="w-full h-full" style={{ backgroundColor: '#ffffff', minHeight: '100%' }}>
      <Canvas
        camera={{ 
          position: [0, 0, 6], 
          fov: 45,
          near: 0.1,
          far: 100
        }}
        style={{ background: '#ffffff', width: '100%', height: '100%' }}
        dpr={[1, 2]}
        frameloop="always"
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={<Loader />}>
          <Scene images={images} />
        </Suspense>
      </Canvas>
    </div>
  );
}
