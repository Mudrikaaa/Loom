<div align="center">

# 🧵 Loom

### Local-first Markdown notes with a 3D knowledge graph

Write in plain Markdown, link your ideas with `[[wikilinks]]`, and watch your notes come together as a living 3D graph — all stored locally on your machine.

![Tauri](https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

</div>

---

## ✨ Overview

**Loom** is a cross-platform desktop app for thinking in Markdown. Your notes live as ordinary `.md` files in a local folder (your "vault") — no cloud, no lock-in — while Loom links them together and renders the connections as an interactive **3D knowledge graph**. It's built for people who like Obsidian-style linking but want something fast, local, and their own.

---

## 🚀 Features

- 📝 **Markdown editor** — A fast CodeMirror-based editor with live preview and syntax highlighting.
- 🔗 **Wikilinks & backlinks** — Connect notes with `[[links]]` and see every note that references the current one.
- 🌐 **3D knowledge graph** — Explore your vault as an interactive force-directed 3D graph of notes and links.
- 📁 **Local-first vault** — Everything is plain Markdown on your disk; pick any folder as your vault.
- 👀 **Live file syncing** — Changes on disk are watched and reflected instantly, with conflict handling.
- 🗑️ **Safe delete** — Removed notes go to the system trash, not oblivion.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Desktop shell** | Tauri 2 (Rust) |
| **Frontend** | React 19, TypeScript, Vite |
| **Editor** | CodeMirror 6 (Markdown, Lezer) |
| **Graph** | react-force-graph-3d, Three.js |
| **State** | Zustand |
| **Backend (Rust)** | walkdir, notify, trash, serde |

---

## 📦 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Platform dependencies for [Tauri](https://tauri.app/start/prerequisites/)

### Run in development
```bash
npm install
npm run tauri dev
```

### Build a release binary
```bash
npm run tauri build
```

---

## 📁 Project Structure

```
loom/
├── src/            # React + TypeScript frontend
│   ├── editor/     # CodeMirror editor, wikilinks, live preview
│   ├── graph/      # 3D knowledge graph view
│   ├── components/ # Sidebar, backlinks, vault picker, toasts
│   ├── lib/        # IPC + link resolution
│   └── state/      # Zustand store
└── src-tauri/      # Rust backend (file I/O, watching, trash)
```
