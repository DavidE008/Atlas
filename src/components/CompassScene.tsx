import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Pause, Play, RotateCw } from "lucide-react";
export function CompassScene({ compact = false }: { compact?: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
  const turns = useRef(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (paused || reducedMotion || event.pointerType === "touch" || !scene.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    scene.current.style.setProperty(
      "--tilt-x",
      ((event.clientY - bounds.top) / bounds.height) * -32 + 16 + "deg",
    );
    scene.current.style.setProperty(
      "--tilt-y",
      ((event.clientX - bounds.left) / bounds.width) * 40 - 20 + "deg",
    );
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    scene.current.style.setProperty("--drift-x", x * -24 + "px");
    scene.current.style.setProperty("--drift-y", y * -24 + "px");
    scene.current.style.setProperty("--ring-nudge", x * 24 + "deg");
  }
  function reset() {
    scene.current?.style.setProperty("--tilt-x", "0deg");
    scene.current?.style.setProperty("--tilt-y", "0deg");
    scene.current?.style.setProperty("--drift-x", "0px");
    scene.current?.style.setProperty("--drift-y", "0px");
    scene.current?.style.setProperty("--ring-nudge", "0deg");
  }
  return (
    <div
      className={
        "compass-scene" +
        (compact ? " is-compact" : "") +
        (paused || reducedMotion ? " is-paused" : "")
      }
      onPointerMove={tilt}
      onPointerLeave={reset}
    >
      <div ref={scene} className="compass-tilt" aria-hidden="true">
        <div className="compass-orbit-response">
          <div className="compass-orbit-plane">
            <img
              className="compass-orbit"
              src="/images/atlas-orbit.webp"
              alt=""
              width="1024"
              height="1024"
              draggable={false}
            />
          </div>
        </div>
        <div className="compass-needle-response">
          <img
            className="compass-crystal"
            src="/images/atlas-compass.webp"
            alt=""
            width="1024"
            height="1024"
            draggable={false}
          />
        </div>
      </div>
      {!compact && !reducedMotion && (
        <div className="compass-motion-controls">
          <button
            type="button"
            className="compass-turn"
            disabled={paused}
            onClick={() => {
              turns.current += 45;
              scene.current?.style.setProperty("--compass-turn", turns.current + "deg");
            }}
            aria-label="Turn compass ring"
          >
            <RotateCw size={14} /> Turn the ring
          </button>
          <button
            type="button"
            className="motion-toggle"
            aria-label={paused ? "Play compass animation" : "Pause compass animation"}
            aria-pressed={paused}
            onClick={() => {
              setPaused(!paused);
              reset();
            }}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            <span>{paused ? "Play motion" : "Pause motion"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
