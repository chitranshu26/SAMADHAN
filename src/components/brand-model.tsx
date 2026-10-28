"use client";

import { useEffect, useRef, useState } from "react";

/** Decorative GLB presentation; no application state or navigation dependencies. */
export function BrandModel() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false, frame = 0, inView = false;
    let renderer: import("three").WebGLRenderer | undefined;
    let scene: import("three").Scene | undefined;
    let decoder: import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader | undefined;
    let render: (() => void) | undefined;
    const free = (object: import("three").Object3D) => object.traverse(child => {
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
    let yaw = 0, pitch = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = container.getBoundingClientRect();
      yaw = ((event.clientX - rect.left) / rect.width - .5) * .32;
      pitch = ((event.clientY - rect.top) / rect.height - .5) * .12;
      render?.();
    };
    const reset = () => { yaw = 0; pitch = 0; render?.(); };
    const visibility = () => { if (!document.hidden) render?.(); };
    const observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (inView) render?.();
    });
    observer.observe(container);
    const resize = new ResizeObserver(() => render?.()); resize.observe(container);
    container.addEventListener("pointermove", move); container.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", visibility);
    let launched = false;
    const startModel = () => {
      if (launched || disposed) return;
      launched = true;
      void (async () => {
      try {
        const [T, { GLTFLoader }, { DRACOLoader }] = await Promise.all([
          import("three"), import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/loaders/DRACOLoader.js"),
        ]);
        if (disposed) return;
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = T.SRGBColorSpace;
        container.appendChild(renderer.domElement);
        scene = new T.Scene();
        scene.add(new T.HemisphereLight(0xffffff, 0x8494ad, 2.5));
        const light = new T.DirectionalLight(0xffffff, 3); light.position.set(3, 4, 6); scene.add(light);
        const fill = new T.DirectionalLight(0xe6fff2, 1); fill.position.set(-3, 1, 4); scene.add(fill);
        decoder = new DRACOLoader(); decoder.setDecoderPath("/branding/draco/");
        const loader = new GLTFLoader(); loader.setDRACOLoader(decoder);
        const asset = await loader.loadAsync("/branding/samadhan-logo.glb");
        if (disposed) { free(asset.scene); return; }
        const model = asset.scene, box = new T.Box3().setFromObject(model);
        const size = box.getSize(new T.Vector3()); model.position.sub(box.getCenter(new T.Vector3()));
        const pivot = new T.Group(); pivot.add(model); scene.add(pivot);
        const camera = new T.PerspectiveCamera(34, 1, .01, 1000);
        const began = performance.now();
        render = () => {
          cancelAnimationFrame(frame);
          if (disposed || !renderer || !scene || !inView || document.hidden) return;
          const width = container.clientWidth, height = container.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height, false); camera.aspect = width / height;
          const distance = Math.max(size.y, size.x / camera.aspect, size.z) / (2 * Math.tan(T.MathUtils.degToRad(17))) * 1.25;
          camera.position.set(0, 0, distance + size.z / 2); camera.lookAt(0, 0, 0);
          camera.near = Math.max(distance / 100, .001); camera.far = distance * 20 + 100; camera.updateProjectionMatrix();
          const t = Math.min((performance.now() - began) / 1200, 1);
          pivot.rotation.y = -.35 * Math.pow(1 - t, 3) + yaw; pivot.rotation.x = pitch;
          renderer.render(scene, camera);
          if (t < 1) frame = requestAnimationFrame(render!);
        };
        render(); setReady(true);
      } catch { /* The supplied logo remains visible without WebGL or decoding. */ }
      })();
    };
    // The decorative startup scene finishes before this homepage scene starts.
    const delay = window.setTimeout(startModel, 4100);
    if (document.documentElement.dataset.samadhanIntroComplete === "true") startModel();
    else window.addEventListener("samadhan:intro-complete", startModel, { once: true });
    return () => {
      clearTimeout(delay);
      window.removeEventListener("samadhan:intro-complete", startModel);
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
      container.removeEventListener("pointermove", move); container.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", visibility);
      if (scene) free(scene); decoder?.dispose(); renderer?.dispose(); renderer?.domElement.remove();
    };
  }, []);
  return <figure className={`brand-model ${ready ? "is-ready" : ""}`}>
    <div className="brand-model-stage" ref={host} role="img" aria-label="SAMADHAN three-dimensional educational grievance portal emblem">
      <img src="/branding/samadhan-model-poster.png" alt="SAMADHAN — Listen, address, resolve, empower" width="638" height="533" />
    </div>
    <figcaption>LISTEN · ADDRESS · RESOLVE · EMPOWER</figcaption>
  </figure>;
}
