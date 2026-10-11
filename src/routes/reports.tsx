import { createFileRoute, redirect } from "@tanstack/react-router";
// Keep old shared URLs useful while Atlas focuses on environmental missions.
export const Route = createFileRoute("/reports")({
  beforeLoad: () => {
    throw redirect({ to: "/missions", replace: true });
  },
});
