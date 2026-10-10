import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Factory, MapPinned, Wind } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — AirWatch Houston" },
      {
        name: "description",
        content:
          "Why Houston needs transparent, community-verified air-quality data — and how AirWatch combines live sensing, crowdsourced reports, and on-chain proof.",
      },
      { property: "og:title", content: "About — AirWatch Houston" },
      {
        property: "og:description",
        content:
          "Why Houston needs transparent, community-verified air-quality data — and how AirWatch combines live sensing, crowdsourced reports, and on-chain proof.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl font-bold">
        The air Houston breathes, <span className="text-primary">verified.</span>
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        Houston is home to the largest petrochemical complex in the United States.
        The Ship Channel corridor sits beside some of the city's most densely
        populated neighborhoods — and the people who live there are often the
        first to notice when something is in the air.
      </p>

      <div className="mt-10 space-y-6">
        <div className="flex gap-4 rounded-xl border border-border bg-card p-5">
          <Wind className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Live data, neighborhood scale</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              AirWatch pulls current air-quality conditions for sixteen Houston
              neighborhoods — from the Heights to Clear Lake to the Ship Channel —
              and translates raw AQI numbers into plain-language health guidance.
            </p>
          </div>
        </div>

        <div className="flex gap-4 rounded-xl border border-border bg-card p-5">
          <MapPinned className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Community eyes on the ground</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Sensors don't catch everything. Residents can log smoke, chemical
              odors, dust, and visible pollution with a photo and a location,
              building a crowdsourced record of what official monitors miss.
            </p>
          </div>
        </div>

        <div className="flex gap-4 rounded-xl border border-border bg-card p-5">
          <BadgeCheck className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Proof that can't be edited</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Any report can be attested on Solana: a hash of the observation is
              written to the blockchain, creating a timestamped, tamper-proof
              public record. Environmental data that communities can trust —
              because no one can quietly change it later.
            </p>
          </div>
        </div>

        <div className="flex gap-4 rounded-xl border border-border bg-card p-5">
          <Factory className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-lg font-semibold">Why it matters</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Harris County regularly records some of the highest ozone levels in
              Texas, and fenceline communities bear a disproportionate share of
              exposure. Transparent, verifiable data is the first step toward
              accountability — and toward cleaner air for everyone.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 flex gap-3">
        <Link
          to="/"
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Explore the dashboard
        </Link>
        <Link
          to="/reports"
          className="rounded-md border border-input px-5 py-2.5 text-sm font-medium hover:bg-accent"
        >
          Log an observation
        </Link>
      </div>

    </div>
  );
}
