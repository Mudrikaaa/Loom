/** Mirrors of the Rust-side serialized types (camelCase over IPC). */

export interface NoteMeta {
  id: string;
  title: string;
  mtimeMs: number;
  size: number;
}

export interface NoteContent {
  id: string;
  content: string;
  mtimeMs: number;
}

export interface VaultSnapshot {
  root: string;
  notes: NoteMeta[];
}

export interface BacklinkEntry {
  id: string;
  title: string;
  /** The line (trimmed) where the link occurs, for display context. */
  context: string;
}

export interface GraphNode {
  id: string;
  title: string;
  kind: "note" | "phantom";
  degree: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Payload of the `vault://files-changed` push event. */
export interface FilesChangedPayload {
  /** "self" = caused by this app's own command; "external" = someone else. */
  origin: "self" | "external";
  changed: NoteMeta[];
  removed: string[];
}

/** Structured error shape produced by the Rust `AppError` serializer. */
export interface AppError {
  kind:
    | "io"
    | "noVault"
    | "invalidId"
    | "notFound"
    | "alreadyExists"
    | "conflict"
    | "other";
  message: string;
  diskMtimeMs?: number;
}

export function isAppError(e: unknown): e is AppError {
  return (
    typeof e === "object" &&
    e !== null &&
    "kind" in e &&
    "message" in e
  );
}

export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
