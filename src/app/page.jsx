"use client";
import { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Papa from "papaparse";
import * as THREE from "three";

// ---- Generate a Hubble-style round/glow star texture ----
function createStarTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  // Draw a sharp, glowing star point
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0.0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.08, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(255,255,220,0.9)");
  gradient.addColorStop(0.26, "rgba(180,180,255,0.55)");
  gradient.addColorStop(0.5, "rgba(180,200,255,0.10)");
  gradient.addColorStop(1.0, "rgba(180,200,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
  ctx.fill();

  return new THREE.Texture(canvas).clone();
}

// ---- StarField Component ----
function StarField({ stars, onStarClick }) {
  const meshRef = useRef();
  const { camera, gl, scene } = useThree();
  const sprite = useRef();

  // One sprite, initialized once!
  if (!sprite.current) sprite.current = createStarTexture();

  // Add fog to the scene (if you want)
  useEffect(() => {
    scene.fog = new THREE.Fog("black", 2000, 6000);
    return () => { scene.fog = null; };
  }, [scene]);

  // Picking: click to select
  useEffect(() => {
    function handleClick(event) {
      const { left, top, width, height } = gl.domElement.getBoundingClientRect();
      const x = ((event.clientX - left) / width) * 2 - 1;
      const y = -((event.clientY - top) / height) * 2 + 1;
      const mouse = { x, y };
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(meshRef.current);
      if (intersects.length > 0) {
        const index = intersects[0].index;
        onStarClick(index);
      }
    }
    gl.domElement.addEventListener("click", handleClick);
    return () => gl.domElement.removeEventListener("click", handleClick);
  }, [gl, camera, onStarClick]);

  // **EARLY EXIT if stars aren't loaded**
  if (!stars || !stars.length) return null;

  // Set positions/colors
  const positions = new Float32Array(stars.length * 3);
  const colors = new Float32Array(stars.length * 3);
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    positions[i * 3 + 0] = parseFloat(s.x);
    positions[i * 3 + 1] = parseFloat(s.y);
    positions[i * 3 + 2] = parseFloat(s.z);

    // Color: blue (hot) to red (cool)
    let color = [1, 1, 1];
    if (s.ci) {
      const c = Math.max(-0.4, Math.min(2, parseFloat(s.ci) || 0));
      color = [
        Math.min(1, 1.5 - c), // R
        Math.min(1, 1.2 - Math.abs(0.4 - c)), // G
        Math.min(1, 1.8 * c) // B
      ];
    }
    colors[i * 3 + 0] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
  }

  return (
    <>
      <points ref={meshRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={positions}
            count={positions.length / 3}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            array={colors}
            count={colors.length / 3}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={5}
          sizeAttenuation={true}
          opacity={1}
          transparent
          map={sprite.current}
          alphaTest={0.05}
          fog={true}
        />
      </points>
      <EffectComposer>
        <Bloom
          intensity={2.5}
          luminanceThreshold={0.1}
          luminanceSmoothing={0.1}
        />
      </EffectComposer>
    </>
  );
}

// ---- Sidebar Component ----
function StarSidebar({ star, onClose }) {
  if (!star) return null;
  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-black/90 text-white shadow-2xl z-50 flex flex-col p-6" style={{ minWidth: 300, maxWidth: 380 }}>
      <button onClick={onClose} className="mb-4 text-right text-lg hover:text-yellow-400">✕</button>
      <h2 className="text-2xl mb-2 font-bold">{star.proper || "Unnamed star"}</h2>
      <div className="text-sm opacity-80 mb-2">{star.bayer || star.gl || star.hd ? [star.bayer, star.gl, star.hd].filter(Boolean).join(", ") : "No alternate names"}</div>
      <div><b>Distance:</b> {star.dist ? `${parseFloat(star.dist).toFixed(2)} ly` : "?"}</div>
      <div><b>Magnitude:</b> {star.mag || "?"}</div>
      <div><b>Spectral Type:</b> {star.spect || "?"}</div>
      <div><b>Constellation:</b> {star.con || "?"}</div>
      <div><b>RA / Dec:</b> {star.ra || "?"} / {star.dec || "?"}</div>
      <div className="mt-3 opacity-70 text-xs">Hipparcos: {star.hip || "N/A"}</div>
      <div className="mt-3 text-xs opacity-50">Click and drag to move. Scroll to zoom.</div>
    </div>
  );
}

export default function Home() {
  const [stars, setStars] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/hygdata_v41.csv")
      .then(res => res.text())
      .then(text => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: results => {
            const filtered = results.data.filter(
              (row) => row.x && row.y && row.z && !isNaN(parseFloat(row.x))
            );
            setStars(filtered);
            setLoading(false);
            console.log("Loaded", filtered.length, "stars. Example:", filtered[0]);
          }
        });
      });
  }, []);

  const filteredStars = search.length > 1
    ? stars.filter(
        (s) =>
          (s.proper && s.proper.toLowerCase().includes(search.toLowerCase())) ||
          (s.bayer && s.bayer.toLowerCase().includes(search.toLowerCase())) ||
          (s.gl && s.gl.toLowerCase().includes(search.toLowerCase()))
      )
    : stars;

  return (
    <div className="w-screen h-screen relative bg-black">
      <StarSidebar star={selected} onClose={() => setSelected(null)} />
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 w-96">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="   Search for a star (e.g. Sirius, Betelgeuse)"
          className="w-full p-3 rounded-2xl text-lg bg-black/70 text-white border border-white/20 shadow-lg focus:outline-none"
        />
      </div>
      {/* Show loading spinner or message until data is loaded */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <span className="text-white text-lg bg-black/70 rounded-2xl px-6 py-3 border border-white/10 shadow-lg">
            Loading {``} stars...
          </span>
        </div>
      )}
      <Canvas
        camera={{ position: [0, 0, 1200], far: 100000 }}
        style={{ background: "black", width: "100vw", height: "100vh" }}
      >
        <ambientLight intensity={0.25} />
        {/* Only render if we have stars! */}
        {filteredStars.length > 0 && (
          <StarField
            stars={filteredStars}
            onStarClick={index => setSelected(filteredStars[index])}
          />
        )}
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={0.1}
          maxDistance={100000}
        />
      </Canvas>
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 text-white/70 text-xs z-40">
        Universe Map • Drag to orbit • Click a star!
      </div>
    </div>
  );
}
