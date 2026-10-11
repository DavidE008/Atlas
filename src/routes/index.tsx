import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { CompassScene } from "@/components/CompassScene";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atlas — Find your direction. Make a difference." },
      {
        name: "description",
        content:
          "Discover local environmental missions. Fund meaningful work with rewards held on Solana and completion reviewed by people.",
      },
      { property: "og:title", content: "Atlas — Local action. Visible change." },
    ],
  }),
  component: LandingPage,
});
const steps = [
  ["01", "Find a mission", "Discover local environmental missions near you."],
  ["02", "Make it happen", "Complete the work and submit photo evidence."],
  ["03", "Share the proof", "Independent human review releases the reward."],
];
function LandingPage() {
  return (
    <>
      <section className="landing-hero" aria-labelledby="landing-title">
        <img
          className="hero-landscape"
          src="/images/atlas-landscape.webp"
          alt=""
          fetchPriority="high"
          width="1800"
          height="1100"
        />
        <div className="hero-copy">
          <h1 id="landing-title">
            Find your
            <br />
            direction.
            <br />
            <span>
              Make a<br />
              difference.
            </span>
          </h1>
          <p>
            Discover local missions. Fund meaningful work.
            <br className="desktop-break" /> Turn small actions into visible change.
          </p>
          <div className="hero-actions">
            <Link to="/missions" className="button-primary">
              Explore missions <ArrowRight size={21} />
            </Link>
            <Link to="/auth" search={{ mode: "signup" }} className="button-text">
              Create account <ArrowRight size={20} />
            </Link>
          </div>
          <p className="hero-trust">
            <img
              className="solana-mark"
              src="/solana-logo-mark.svg"
              alt="Solana"
              width="22"
              height="20"
            />
            <span>Rewards held on Solana. Completion reviewed by people.</span>
          </p>
        </div>
        <div className="hero-compass">
          <CompassScene />
        </div>
      </section>
      <section className="journey-strip" aria-label="How Atlas works">
        {steps.map(([number, title, description]) => (
          <article key={number}>
            <span className="step-number">{number}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
      <footer className="site-footer">
        <span>Atlas · Local action. Visible change.</span>
        <span>Houston pilot · Solana devnet</span>
        <Link to="/about">
          Our approach <ArrowRight size={14} />
        </Link>
      </footer>
    </>
  );
}
