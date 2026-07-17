import { useEffect, useState } from "react";

/** Frames-per-second probe: honest numbers for the stress test. */
export function FpsMeter({ nodes, links }: { nodes: number; links: number }) {
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
