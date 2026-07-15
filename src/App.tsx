import { useEffect, useRef } from "react";
import { useStore } from "./state/store";
import { VaultPicker } from "./components/VaultPicker";
import { Sidebar } from "./components/Sidebar";
import { EditorPane } from "./components/EditorPane";
import { BacklinksPanel } from "./components/BacklinksPanel";
import { GraphView } from "./graph/GraphView";
import { Toast } from "./components/Toast";
import "./App.css";

function App() {
  const phase = useStore((s) => s.phase);
  const view = useStore((s) => s.view);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return; // StrictMode double-mount guard
    booted.current = true;
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
