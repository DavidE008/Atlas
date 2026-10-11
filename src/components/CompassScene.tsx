import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
export function CompassScene({ compact = false }: { compact?: boolean }) {
  const scene = useRef<HTMLDivElement>(null);
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
      ((event.clientY - bounds.top) / bounds.height) * -12 + 6 + "deg",
    );
    scene.current.style.setProperty(
      "--tilt-y",
      ((event.clientX - bounds.left) / bounds.width) * 16 - 8 + "deg",
    );
  }
  function reset() {
    scene.current?.style.setProperty("--tilt-x", "0deg");
    scene.current?.style.setProperty("--tilt-y", "0deg");
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
        <img
          className="compass-crystal"
          src="/images/atlas-compass.webp"
          alt=""
          width="1024"
          height="1024"
          draggable={false}
        />
      </div>
      {!compact && !reducedMotion && (
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
      )}
    </div>
  );
}
