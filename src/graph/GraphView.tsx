/**
 * 3D knowledge graph view (react-force-graph-3d / Three.js WebGL).
 * Consumes graph snapshots from the store; rendering-only module.
 *
 * Interactions: orbit (drag), zoom (wheel), pan (right-drag), hover for
 * label, click a note to open it, click a phantom to create that note.
 * Visuals: bloom glow, text labels under nodes (small/medium graphs),
 * auto zoom-to-fit once the force layout settles.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useStore } from "../state/store";
import type { GraphNode } from "../lib/types";

const COLOR_NOTE = "#5b9dff";
const COLOR_NOTE_HUB = "#8fc1ff";
const COLOR_PHANTOM = "#5a6890";
const COLOR_CURRENT = "#4de1ff";
const COLOR_LINK = "#31497f";
const LABEL_LIMIT = 400; // above this, labels only on hover

/** Frames-per-second probe: honest numbers for the stress test. */
function FpsMeter({ nodes, links }: { nodes: number; links: number }) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fps-meter">
      {fps} fps · {nodes} nodes · {links} links
    </div>
  );
}

/* DEV: forward uncaught errors to the local collector while the black-graph
 * fix is being confirmed; stripped once verified. */
if (import.meta.env.DEV) {
  window.addEventListener("error", (e) =>
    void fetch("http://127.0.0.1:8932/log", {
      method: "POST",
      body: `window.onerror ${e.message} @ ${e.filename}:${e.lineno}`,
    }).catch(() => {}),
  );
}

export function GraphView() {
  const graph = useStore((s) => s.graph);
  const graphLoading = useStore((s) => s.graphLoading);
  const currentId = useStore((s) => s.currentId);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const didFitRef = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bloom pass: a *subtle* glow. Strength adapts down as node count grows —
  // additive light stacks up fast on dense graphs (the plasma-ball incident).
  const nodeCount = graph?.nodes.length ?? 0;
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || nodeCount === 0) return;
    const strength = nodeCount > 2000 ? 0.12 : nodeCount > 500 ? 0.22 : 0.45;
    const bloom = new UnrealBloomPass(undefined as never, strength, 0.4, 0.1);
    fg.postProcessingComposer().addPass(bloom);
    return () => {
      try {
        fg.postProcessingComposer().removePass(bloom);
      } catch {
        /* composer may already be disposed */
      }
    };
  }, [nodeCount === 0, nodeCount > 500, nodeCount > 2000]);

  // Spread the layout: stronger repulsion + longer links keep dense vaults
  // from collapsing into an unreadable ball. Configure only — never call
  // d3ReheatSimulation() here: the engine ingests data asynchronously and
  // reheating before that kills its animation loop (black-canvas bug).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || nodeCount === 0) return;
    fg.d3Force("charge")?.strength(-70);
    fg.d3Force("link")?.distance(45);
  }, [nodeCount === 0]);

  // The force engine mutates node objects (x/y/z...), so hand it copies and
  // keep the store's snapshot immutable.
  const data = useMemo(() => {
    didFitRef.current = false;
    if (!graph) return { nodes: [], links: [] };
    return {
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: graph.links.map((l) => ({ ...l })),
    };
  }, [graph]);

  const large = data.nodes.length > 2000;
  const showLabels = data.nodes.length <= LABEL_LIMIT;

  if (graphLoading || !graph) {
    return (
      <main className="graph-view" ref={containerRef}>
        <div className="graph-center">
          <div className="spinner" />
          <p className="muted">Weaving the graph…</p>
        </div>
      </main>
    );
  }

  if (data.nodes.length === 0) {
    return (
      <main className="graph-view" ref={containerRef}>
        <div className="graph-center">
          <p className="muted">
            Nothing to weave yet — create some notes and link them with{" "}
            <code>[[…]]</code>.
          </p>
        </div>
      </main>
    );
  }

  const colorOf = (node: GraphNode) => {
    if (node.id === currentId) return COLOR_CURRENT;
    if (node.kind === "phantom") return COLOR_PHANTOM;
    return node.degree >= 6 ? COLOR_NOTE_HUB : COLOR_NOTE;
  };

  return (
    <main className="graph-view" ref={containerRef}>
      <ForceGraph3D
        ref={fgRef}
        width={size.w || undefined}
        height={size.h || undefined}
        graphData={data}
        backgroundColor="rgba(4,6,11,0)"
        showNavInfo={false}
        nodeLabel={(n) => {
          const node = n as GraphNode;
          return node.kind === "phantom"
            ? `${node.title} (not created yet — click to create)`
            : node.title;
        }}
        nodeColor={(n) => colorOf(n as GraphNode)}
        nodeRelSize={3}
        nodeVal={(n) => Math.min(12, 1 + (n as GraphNode).degree * 0.4)}
        nodeOpacity={0.95}
        nodeResolution={large ? 6 : data.nodes.length > 400 ? 8 : 16}
        nodeThreeObjectExtend={true}
        nodeThreeObject={(n: object) => {
          if (!showLabels) return false as unknown as never;
          const node = n as GraphNode;
          const sprite = new SpriteText(node.title);
          sprite.color = node.kind === "phantom" ? "#7d8bb0" : "#c9daff";
          sprite.textHeight = 2.6;
          // SpriteText extends THREE.Sprite; its d.ts just doesn't say so.
          const obj = sprite as unknown as import("three").Sprite;
          obj.material.depthWrite = false;
          obj.position.set(0, -(4 + Math.sqrt(2 + node.degree) * 2), 0);
          return sprite;
        }}
        linkColor={() => COLOR_LINK}
        linkOpacity={data.nodes.length > 500 ? 0.3 : 0.5}
        enableNodeDrag={!large}
        cooldownTime={large ? 8000 : 15000}
        onEngineStop={() => {
          if (!didFitRef.current && fgRef.current) {
            didFitRef.current = true;
            fgRef.current.zoomToFit(600, 40);
          }
        }}
        onNodeClick={(n) => {
          const node = n as GraphNode;
          const store = useStore.getState();
          if (node.kind === "phantom") {
            void store.followWikiLink(node.title).then(() => {
              store.setView("editor");
            });
          } else {
            void store.openNote(node.id).then(() => {
              store.setView("editor");
            });
          }
        }}
      />
      <FpsMeter nodes={data.nodes.length} links={data.links.length} />
    </main>
  );
}
