import { useStore } from "../state/store";

/** Full-screen empty state shown when no vault is open. */
export function VaultPicker() {
  const pickVault = useStore((s) => s.pickVault);
  return (
    <div className="vault-picker">
      <div className="vault-picker-card">
        <div className="app-mark">Loom</div>
        <p className="vault-picker-tagline">
          Local Markdown notes, woven into a 3D knowledge graph.
        </p>
        <button className="btn-primary" onClick={() => void pickVault()}>
          Open a vault folder
        </button>
        <p className="vault-picker-hint">
          A vault is just a folder of <code>.md</code> files on your disk.
        </p>
      </div>
    </div>
  );
}
