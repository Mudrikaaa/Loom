import { useEffect, useRef } from "react";
import { useStore } from "./state/store";
import { VaultPicker } from "./components/VaultPicker";
import { Sidebar } from "./components/Sidebar";
import { EditorPane } from "./components/EditorPane";
import { BacklinksPanel } from "./components/BacklinksPanel";
import { GraphView } from "./graph/GraphView";
import { Toast } from "./components/Toast";
import type { GraphData } from "./lib/types";
import "./App.css";

/** Synthetic graph for the dev-only `?graphtest` harness. */
function makeMockGraph(n: number): GraphData {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `Note ${i}.md`,
    title: `Note ${i}`,
    kind: (i % 17 === 0 ? "phantom" : "note") as "note" | "phantom",
    degree: 0,
  }));
  const links = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 1; i < n; i++) {
    const targets = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < targets; k++) {
      const j = Math.floor(rnd() * i);
      links.push({ source: nodes[i].id, target: nodes[j].id });
      nodes[i].degree++;
      nodes[j].degree++;
    }
  }
  return { nodes, links };
}

function App() {
  const phase = useStore((s) => s.phase);
  const view = useStore((s) => s.view);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return; // StrictMode double-mount guard
    booted.current = true;
    // Dev-only graph harness: `?graphtest[=N]` renders the graph view with
    // synthetic data in a plain browser (no Tauri), for visual debugging.
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search);
      if (params.has("graphtest")) {
        useStore.setState({
          phase: "ready",
          view: "graph",
          vaultRoot: "graphtest",
          graph: makeMockGraph(Number(params.get("graphtest")) || 150),
        });
        return;
      }
    }
    void useStore.getState().boot();
  }, []);

  return (
    <div className="app">
      {phase === "boot" || phase === "opening" ? (
        <div className="app-loading">
          <div className="spinner" />
          <p className="muted">
            {phase === "boot" ? "Starting Loom…" : "Opening vault…"}
          </p>
        </div>
      ) : phase === "noVault" ? (
        <VaultPicker />
      ) : (
        <div className="workspace">
          <Sidebar />
          {view === "graph" ? (
            <GraphView />
          ) : (
            <>
              <EditorPane />
              <BacklinksPanel />
            </>
          )}
        </div>
      )}
      <Toast />
    </div>
  );
}

export default App;
