/**
 * Fast-path 3D graph renderer for large vaults (> ~2000 nodes).
 *
 * The library path (react-force-graph-3d) creates one Three.js object per
 * node and per link — at 5k notes that's ~45k draw calls and single-digit
 * FPS on integrated GPUs. This renderer draws the same scene in TWO draw
 * calls: one InstancedMesh for every node (per-instance transform + color)
 * and one LineSegments batch for every link. Layout comes from the same
 * d3-force-3d engine the library uses; interaction (orbit/zoom/pan, hover
 * focus, click-to-open) is reimplemented directly.
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force-3d";
import { useStore } from "../state/store";
import type { GraphData, GraphNode } from "../lib/types";
import { FpsMeter } from "./FpsMeter";
import {
  COLOR_CURRENT,
  COLOR_DIM,
  COLOR_HOVER,
  COLOR_LINK,
  COLOR_NOTE,
  COLOR_NOTE_HUB,
  COLOR_PHANTOM,
  FOG_COLOR,
} from "./palette";

interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  z?: number;
  index?: number;
}

interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
}

const SIM_ALPHA_MIN = 0.02;
const SIM_TIME_BUDGET_MS = 15000;

function baseColorOf(node: GraphNode, currentId: string | null): THREE.Color {
  if (node.id === currentId) return new THREE.Color(COLOR_CURRENT);
  if (node.kind === "phantom") return new THREE.Color(COLOR_PHANTOM);
  return new THREE.Color(node.degree >= 6 ? COLOR_NOTE_HUB : COLOR_NOTE);
}

function radiusOf(node: GraphNode): number {
  // Match the library path: relSize 2.5 * cbrt(clamped value).
  return 2.5 * Math.cbrt(Math.min(8, 1 + node.degree * 0.3));
}

export function BigGraph({ graph }: { graph: GraphData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);
  const [settling, setSettling] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const currentId = useStore.getState().currentId;

    /* ---------- scene ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00055);
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(1, 1, 2);
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      1,
      50000,
    );
    camera.position.z = 300 * Math.cbrt(graph.nodes.length / 50);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;

    /* ---------- data ---------- */
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = graph.links.map((l) => ({ ...l }));
    const indexOf = new Map<string, number>();
    nodes.forEach((n, i) => indexOf.set(n.id, i));

    const adjacency = new Map<number, Set<number>>();
    for (const l of links) {
      const s = indexOf.get(l.source as string);
      const t = indexOf.get(l.target as string);
      if (s === undefined || t === undefined) continue;
      if (!adjacency.has(s)) adjacency.set(s, new Set());
      if (!adjacency.has(t)) adjacency.set(t, new Set());
      adjacency.get(s)!.add(t);
      adjacency.get(t)!.add(s);
    }

    /* ---------- nodes: one InstancedMesh ---------- */
    const sphere = new THREE.SphereGeometry(1, 6, 5);
    const nodeMaterial = new THREE.MeshLambertMaterial();
    const mesh = new THREE.InstancedMesh(sphere, nodeMaterial, nodes.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const baseColors: THREE.Color[] = nodes.map((n) =>
      baseColorOf(n, currentId),
    );
    nodes.forEach((_, i) => mesh.setColorAt(i, baseColors[i]));
    scene.add(mesh);

    /* ---------- links: one LineSegments batch ---------- */
    const linePositions = new Float32Array(links.length * 6);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(linePositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      color: COLOR_LINK,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    /* ---------- layout ---------- */
    const simulation = forceSimulation(nodes, 3)
      .force(
        "link",
        forceLink(links)
          .id((d: SimNode) => d.id)
          .distance(45),
      )
      .force("charge", forceManyBody().strength(-70).distanceMax(700))
      .force("center", forceCenter(0, 0, 0))
      .stop();

    const dummy = new THREE.Object3D();
    function updatePositions() {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        dummy.position.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);
        const r = radiusOf(n);
        dummy.scale.set(r, r, r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < links.length; i++) {
        const s = links[i].source as SimNode;
        const t = links[i].target as SimNode;
        const o = i * 6;
        linePositions[o] = s.x ?? 0;
        linePositions[o + 1] = s.y ?? 0;
        linePositions[o + 2] = s.z ?? 0;
        linePositions[o + 3] = t.x ?? 0;
        linePositions[o + 4] = t.y ?? 0;
        linePositions[o + 5] = t.z ?? 0;
      }
      (lineGeometry.attributes.position as THREE.BufferAttribute).needsUpdate =
        true;
    }
    updatePositions();

    function fitCamera() {
      const box = new THREE.Box3().setFromBufferAttribute(
        lineGeometry.attributes.position as THREE.BufferAttribute,
      );
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(new THREE.Vector3(0, 0, Math.max(200, size * 0.62)));
    }

    /* ---------- hover / click ---------- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerInside = false;
    let hoverIndex = -1;
    let downPos: { x: number; y: number } | null = null;

    function applyHoverColors() {
      const neighborSet = hoverIndex >= 0 ? adjacency.get(hoverIndex) : null;
      const dim = new THREE.Color(COLOR_DIM);
      const hov = new THREE.Color(COLOR_HOVER);
      const nb = new THREE.Color(COLOR_NOTE_HUB);
      for (let i = 0; i < nodes.length; i++) {
        const c =
          hoverIndex < 0
            ? baseColors[i]
            : i === hoverIndex
              ? hov
              : neighborSet?.has(i)
                ? nb
                : dim;
        mesh.setColorAt(i, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      lineMaterial.opacity = hoverIndex >= 0 ? 0.08 : 0.22;
    }

    function pick(): number {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(mesh, false);
      return hits.length > 0 ? (hits[0].instanceId ?? -1) : -1;
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerInside = true;
    };
    const onPointerLeave = () => {
      pointerInside = false;
    };
    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!downPos) return;
      const moved =
        Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y);
      downPos = null;
      if (moved > 5 || hoverIndex < 0) return;
      const node = nodes[hoverIndex];
      const store = useStore.getState();
      if (node.kind === "phantom") {
        void store.followWikiLink(node.title).then(() => store.setView("editor"));
      } else {
        void store.openNote(node.id).then(() => store.setView("editor"));
      }
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    /* ---------- resize ---------- */
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    /* ---------- main loop ---------- */
    const started = performance.now();
    let didFit = false;
    let frame = 0;
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      frame++;

      const simActive =
        simulation.alpha() > SIM_ALPHA_MIN &&
        performance.now() - started < SIM_TIME_BUDGET_MS;
      if (simActive) {
        simulation.tick();
        updatePositions();
      } else if (!didFit) {
        didFit = true;
        fitCamera();
        setSettling(false);
      }

      // Raycast every 3rd frame; it's the only per-frame CPU cost left.
      if (frame % 3 === 0 && pointerInside && !downPos) {
        const hit = pick();
        if (hit !== hoverIndex) {
          hoverIndex = hit;
          applyHoverColors();
          setHoverTitle(hit >= 0 ? nodes[hit].title : null);
          renderer.domElement.style.cursor = hit >= 0 ? "pointer" : "default";
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      sphere.dispose();
      nodeMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      simulation.stop();
    };
  }, [graph]);

  return (
    <main className="graph-view big-graph" ref={containerRef}>
      {settling && (
        <div className="graph-settling">arranging {graph.nodes.length} notes…</div>
      )}
      {hoverTitle && <div className="graph-hover-label">{hoverTitle}</div>}
      <FpsMeter nodes={graph.nodes.length} links={graph.links.length} />
    </main>
  );
}
