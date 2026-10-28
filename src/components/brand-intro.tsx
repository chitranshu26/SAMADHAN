"use client";

import { useEffect, useRef, useState } from "react";

function announceIntroComplete() {
  document.documentElement.dataset.samadhanIntroComplete = "true";
  window.dispatchEvent(new Event("samadhan:intro-complete"));
}

/** Decorative startup identity only: never gates the application or its requests. */
export function BrandIntro() {
  const started = useRef(false);
  const host = useRef<HTMLDivElement>(null);
  const release = useRef<(() => void) | null>(null);
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    try {
      if ((sessionStorage.getItem("samadhan-brand-intro-v3") && !started.current) || reduced.matches) { setVisible(false); announceIntroComplete(); return; }
      started.current = true;
      sessionStorage.setItem("samadhan-brand-intro-v3", "seen");
    } catch { setVisible(false); announceIntroComplete(); return; }
    setVisible(true);
    let disposed = false, frame = 0;
    let renderer: import("three").WebGLRenderer | undefined;
    let scene: import("three").Scene | undefined;
    let decoder: import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader | undefined;
    const releaseModel = (object: import("three").Object3D) => {
      object.traverse(child => {
        const mesh = child as import("three").Mesh;
        mesh.geometry?.dispose();
        const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        materials.forEach(material => {
          Object.values(material).forEach(value => {
            if (value && typeof value === "object" && "isTexture" in value) (value as import("three").Texture).dispose();
          });
          material.dispose();
        });
      });
    };
    const dismiss = () => { setLeaving(true); };
    const finish = window.setTimeout(dismiss, 3580);
    const hide = window.setTimeout(() => { setVisible(false); release.current?.(); announceIntroComplete(); }, 4000);
    window.addEventListener("pointerdown", dismiss, { once: true, capture: true });
    window.addEventListener("keydown", dismiss, { once: true, capture: true });
    const stopWhenHidden = () => { if (document.hidden) dismiss(); };
    document.addEventListener("visibilitychange", stopWhenHidden);
    const start = async () => {
      try {
        const [THREE, { GLTFLoader }, { DRACOLoader }] = await Promise.all([
          import("three"), import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/loaders/DRACOLoader.js"),
        ]);
        if (disposed || !host.current) return;
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: window.innerWidth > 600, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(host.current.clientWidth, host.current.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
        host.current.appendChild(renderer.domElement);
        scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8094ad, 2.3));
        const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(3, 4, 6); scene.add(key);
        const fill = new THREE.DirectionalLight(0xe0f8f0, 1.2); fill.position.set(-3, 1, 3); scene.add(fill);
        decoder = new DRACOLoader(); decoder.setDecoderPath("/branding/draco/");
        const loader = new GLTFLoader(); loader.setDRACOLoader(decoder);
        const gltf = await loader.loadAsync("/branding/samadhan-logo.glb");
        if (disposed || !host.current || !renderer) { releaseModel(gltf.scene); return; }
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        model.position.sub(center);
        const pivot = new THREE.Group(); pivot.add(model); scene.add(pivot);
        const aspect = host.current.clientWidth / Math.max(host.current.clientHeight, 1);
        const camera = new THREE.PerspectiveCamera(34, aspect, .01, 1000);
        const distance = Math.max(size.y, size.x / aspect, size.z) / (2 * Math.tan(THREE.MathUtils.degToRad(17))) * 1.25;
        camera.position.set(0, 0, distance + size.z / 2); camera.lookAt(0, 0, 0);
        camera.near = Math.max(distance / 100, .001); camera.far = distance * 20 + 100; camera.updateProjectionMatrix();
        const began = performance.now();
        setModelReady(true);
        const draw = (now: number) => {
          if (disposed || !renderer || !scene || document.hidden) return;
          const t = Math.min((now - began) / 1900, 1), ease = 1 - Math.pow(1 - t, 3);
          pivot.rotation.y = (1 - ease) * -.4;
          pivot.position.y = (ease - 1) * size.y * .06;
          pivot.scale.setScalar(.78 + ease * .22);
          renderer.render(scene, camera);
          if (t < 1) frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      } catch {
        // Keep the supplied PNG visible if WebGL, decoding or the asset is unavailable.
      }
    };
    void start();
    const cleanup = () => {
      disposed = true; clearTimeout(finish); clearTimeout(hide); cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", dismiss, true); window.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("visibilitychange", stopWhenHidden);
      if (scene) releaseModel(scene);
      decoder?.dispose(); renderer?.dispose(); renderer?.domElement.remove();
    };
    release.current = cleanup;
    return cleanup;
  }, []);

  // Release the scene after the decorative reveal.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => { setVisible(false); release.current?.(); announceIntroComplete(); }, 420);
    return () => clearTimeout(timer);
  }, [leaving]);

  if (!visible) return null;
  return <div className={`brand-intro ${leaving ? "is-leaving" : ""}`} aria-hidden="true">
    <div className="brand-intro-orbit" />
    <div className={`brand-intro-model ${modelReady ? "is-ready" : ""}`}>
      <img src="/branding/samadhan-symbol.webp" width="280" height="280" alt="" />
      <div className="brand-intro-canvas" ref={host} />
    </div>
    <div className="brand-intro-copy"><strong>SAMADHAN</strong><span>AICTE GRIEVANCE MONITORING PORTAL</span><small>LISTEN · ADDRESS · RESOLVE · EMPOWER</small></div>
    <div className="brand-intro-line"><i /></div>
    <p>Welcome to SAMADHAN</p>
    <small className="brand-intro-disclaimer">Independent demonstration · Not an official AICTE service</small>
  </div>;
}
