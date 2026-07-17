/**
 * 3D knowledge graph view (react-force-graph-3d / Three.js WebGL).
 * Consumes graph snapshots from the store; rendering-only module.
 *
 * Interactions: orbit (drag), zoom (wheel), pan (right-drag), click a note
 * to open it, click a phantom to create that note. Hovering a node focuses
 * it: the node + direct neighbors light up, the rest dims away.
 * Anti-clutter: faint links, depth fog, adaptive bloom, auto zoom-to-fit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import SpriteText from "three-spritetext";
import { FogExp2 } from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useStore } from "../state/store";
import type { GraphNode } from "../lib/types";
import { BigGraph } from "./BigGraph";
import { FpsMeter } from "./FpsMeter";
import {
  COLOR_CURRENT,
  COLOR_DIM,
  COLOR_HOVER,
  COLOR_LINK,
  COLOR_LINK_DIM,
  COLOR_LINK_HOVER,
  COLOR_NOTE,
  COLOR_NOTE_HUB,
  COLOR_PHANTOM,
  FOG_COLOR,
} from "./palette";

const LABEL_LIMIT = 400; // above this, labels only on hover
/** Above this node count, the instanced fast-path renderer takes over. */
const BIG_GRAPH_THRESHOLD = 2000;

interface LinkEnd {
  id: string;
}
interface RuntimeLink {
  source: string | LinkEnd;
  target: string | LinkEnd;
}

function endId(end: string | LinkEnd): string {
  return typeof end === "object" ? end.id : end;
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
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodeCount = graph?.nodes.length ?? 0;

  // Subtle bloom; strength adapts down as node count grows (additive light
  // stacks up fast on dense graphs).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || nodeCount === 0) return;
    const strength = nodeCount > 2000 ? 0.12 : nodeCount > 500 ? 0.22 : 0.4;
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

  // Depth fog: distant nodes fade out instead of stacking into noise.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || nodeCount === 0) return;
    const density = nodeCount > 2000 ? 0.0007 : nodeCount > 500 ? 0.001 : 0.0014;
    const scene = fg.scene();
    scene.fog = new FogExp2(FOG_COLOR, density);
    return () => {
      scene.fog = null;
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

  // Adjacency for hover focus.
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of data.links) {
      const s = endId(l.source as string | LinkEnd);
      const t = endId(l.target as string | LinkEnd);
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [data]);

  const large = data.nodes.length > 2000;
  const showLabels = data.nodes.length <= LABEL_LIMIT;
  const hoverSet = hoverId ? neighbors.get(hoverId) : undefined;

  const nodeColor = useCallback(
    (n: object) => {
      const node = n as GraphNode;
      if (hoverId) {
        if (node.id === hoverId) return COLOR_HOVER;
        if (hoverSet?.has(node.id)) return COLOR_NOTE_HUB;
        return COLOR_DIM;
      }
      if (node.id === currentId) return COLOR_CURRENT;
      if (node.kind === "phantom") return COLOR_PHANTOM;
      return node.degree >= 6 ? COLOR_NOTE_HUB : COLOR_NOTE;
    },
    [hoverId, hoverSet, currentId],
  );

  const linkColor = useCallback(
    (l: object) => {
      if (!hoverId) return COLOR_LINK;
      const link = l as RuntimeLink;
      const s = endId(link.source);
      const t = endId(link.target);
      return s === hoverId || t === hoverId ? COLOR_LINK_HOVER : COLOR_LINK_DIM;
    },
    [hoverId],
  );

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

  // Large vaults get the instanced fast-path renderer (2 draw calls total)
  // instead of the per-object library renderer.
  if (data.nodes.length > BIG_GRAPH_THRESHOLD) {
    return <BigGraph key={`${graph.nodes.length}:${graph.links.length}`} graph={graph} />;
  }

  return (
    <main className="graph-view" ref={containerRef}>
      <ForceGraph3D
        ref={fgRef}
        width={size.w || undefined}
        height={size.h || undefined}
        graphData={data}
        backgroundColor="rgba(15,12,15,0)"
        showNavInfo={false}
        nodeLabel={(n) => {
          const node = n as GraphNode;
          return node.kind === "phantom"
            ? `${node.title} (not created yet — click to create)`
            : node.title;
        }}
        nodeColor={nodeColor}
        nodeRelSize={2.5}
        nodeVal={(n) => Math.min(8, 1 + (n as GraphNode).degree * 0.3)}
        nodeOpacity={0.95}
        nodeResolution={large ? 6 : data.nodes.length > 400 ? 8 : 16}
        nodeThreeObjectExtend={true}
        nodeThreeObject={(n: object) => {
          if (!showLabels) return false as unknown as never;
          const node = n as GraphNode;
          const sprite = new SpriteText(node.title);
          sprite.color = node.kind === "phantom" ? "#8a8274" : "#e8ddc8";
          sprite.textHeight = 2.6;
          // SpriteText extends THREE.Sprite; its d.ts just doesn't say so.
          const obj = sprite as unknown as import("three").Sprite;
          obj.material.depthWrite = false;
          obj.position.set(0, -(4 + Math.sqrt(2 + node.degree) * 2), 0);
          return sprite;
        }}
        linkColor={linkColor}
        linkOpacity={hoverId ? 0.5 : data.nodes.length > 500 ? 0.14 : 0.3}
        enableNodeDrag={!large}
        cooldownTime={large ? 8000 : 15000}
        onNodeHover={(n) => {
          const id = n ? (n as GraphNode).id : null;
          setHoverId((prev) => (prev === id ? prev : id));
        }}
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
