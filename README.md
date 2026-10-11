# Atlas

Environmental missions with visible evidence and Solana devnet rewards. Discover local work, create an account, fund a mission, and follow its progress through human review.

## Local development

```sh
npm install
npm run dev -- --host 127.0.0.1
```

The current preview runs at http://127.0.0.1:8080/.

Configure the Atlas Supabase URL, publishable key, and project ID in an ignored `.env.local`, using `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID`. The local workspace points to Atlas (`ctzpojcojiacilnjeuiq`). The older tracked `.env` belongs to the legacy project; deployments must explicitly supply the Atlas environment values. Never put service-role keys in frontend variables. Restart Vite after changing environment files.

Email authentication is enabled. Before deploying, configure Supabase Site URL and allowed redirect URLs for the deployment and `/missions`. Google sign-in is not enabled. Account confirmation delivery and a complete wallet-funded mission need end-to-end validation.

## Experience

- `/`: ivory and forest-green landing with alpine artwork and a separate emerald compass/ring animation.
- `/auth?mode=signup` and `/auth?mode=signin`: email account screens.
- `/missions`: live mission catalog, wallet connection, funding, evidence and review workflow.
- The mission page checks the Atlas program's executable state on Devnet before wallet actions.
- `/about`: how missions and human review work.
- `/reports`: redirects to missions.

The compass uses optimized raster layers with CSS orbital motion and pointer tilt, rather than a live Spline/WebGL scene. It includes pause/play and respects reduced-motion preferences. Mobile layouts are responsive; a native Expo client remains future work.

## Stack and checks

React, TypeScript, TanStack Start, Tailwind, Supabase, and Solana devnet. Run `npx tsc --noEmit`, `npm test`, and `npm run build`. Design evidence and limitations are documented in `design-qa.md`.

This repository is connected to Lovable. Preserve published history; pushed commits sync back into Lovable.
