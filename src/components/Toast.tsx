import { useEffect } from "react";
import { useStore } from "../state/store";

/** Transient toast (error or info); auto-dismisses or dismisses on click. */
export function Toast() {
  const error = useStore((s) => s.error);
  const info = useStore((s) => s.info);
  const clearError = useStore((s) => s.clearError);
  const message = error ?? info;

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clearError, error ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [message, error, clearError]);

  if (!message) return null;
  return (
    <div
      className={`toast${error ? "" : " toast-info"}`}
      role="alert"
      onClick={clearError}
    >
      {message}
    </div>
  );
}
