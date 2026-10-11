import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Camera, MapPin, ShieldCheck } from "lucide-react";
export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "How Atlas works" },
      {
        name: "description",
        content:
          "Find environmental missions, fund rewards, and follow the work from completion to human review.",
      },
    ],
  }),
  component: AboutPage,
});
function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-intro">
        <span className="eyebrow">A little action goes a long way</span>
        <h1>
          A clear path.
          <br />
          <em>A tangible difference.</em>
        </h1>
        <p>
          Atlas brings people and purpose together. Support a local cleanup, take on the work, and
          make every step visible.
        </p>
        <Link to="/missions" className="button-primary">
          Find your first mission <ArrowRight size={19} />
        </Link>
      </div>
      <div className="about-steps">
        <article>
          <MapPin size={26} />
          <span>01 / Discover & fund</span>
          <h2>Start close to home.</h2>
          <p>
            Explore local environmental missions. Sponsors define the work, choose an independent
            reviewer, and fund the reward before someone begins.
          </p>
        </article>
        <article>
          <Camera size={26} />
          <span>02 / Act & document</span>
          <h2>Make the change visible.</h2>
          <p>
            Claim a mission with your wallet. Complete the work, then share a photo and a short
            account of what you did before the submission deadline.
          </p>
        </article>
        <article>
          <ShieldCheck size={26} />
          <span>03 / Review & reward</span>
          <h2>Good work deserves follow-through.</h2>
          <p>
            The designated reviewer checks the evidence. Approval releases the reward; rejection
            returns it to the sponsor. Expired missions can be refunded under the mission rules.
          </p>
        </article>
      </div>
      <section className="trust-section">
        <div>
          <span className="eyebrow">Built for transparency</span>
          <h2>
            People verify the work.
            <br />
            Solana holds the reward.
          </h2>
        </div>
        <div>
          <p>
            A blockchain record can protect submitted evidence from being quietly changed. It cannot
            prove that a physical cleanup happened. That judgment belongs to an independent human
            reviewer.
          </p>
          <p>
            Atlas is currently a Houston pilot on Solana devnet. Devnet SOL is test currency. An
            Atlas account saves your mission details and evidence; your wallet signs actions
            involving rewards.
          </p>
          <Link to="/auth" search={{ mode: "signup" }} className="button-text">
            Create your Atlas account <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
