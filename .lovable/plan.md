# AirWatch Houston — CodeRED Orion Hackathon Project

A live air-quality dashboard for Houston targeting the **Best Environment Hack** track, with a light Solana integration for on-chain proof of community reports.

## What the app does

1. **City air-quality dashboard (`/`)**
   - Full-screen map of Houston with color-coded AQI markers across a grid of neighborhoods (Downtown, Heights, Midtown, Third Ward, UH area, etc.)
   - Live AQI + pollutant breakdown (PM2.5, PM10, O3, NO2) per location, fetched from the Google Maps Air Quality API through a server function (cached to stay within request limits)
   - City-wide summary strip: current average AQI, worst neighborhood, trend chart
   - Health guidance panel that changes with the selected location's AQI band

2. **Community reports (`/reports`)**
   - Signed-in users submit geo-tagged air-quality observations (smoke, odor, dust, visible pollution) with optional photo upload
   - Reports appear on the map and in a feed; stored in the database
   - Each report can be "verified" — verification writes a lightweight on-chain attestation

3. **Light Solana integration**
   - Optional "Connect Wallet" (Phantom) button — app works fully without it
   - Verified reports get a Solana devnet transaction (memo program) recording the report hash; the tx signature is stored and linked to Solana Explorer as a public "proof of report" badge
   - No custom smart contract needed — keeps scope realistic for 24 hours

4. **Auth & backend (Lovable Cloud)**
   - Email/password + Google sign-in
   - Tables: `reports` (user observations), `report_verifications` (tx signatures), `profiles`
   - Photo storage bucket for report images
   - Row-level security: anyone can read reports, only owners can create/edit theirs

5. **Pitch-ready extras**
   - `/about` page framing the problem (Houston's air-quality challenges, industrial corridor) for the Best Pitch narrative
   - Dark, map-first visual design with an AQI color system (green → maroon)

## Technical details

- **Stack:** TanStack Start + Tailwind v4 (existing template), Lovable Cloud (Supabase) for DB/auth/storage
- **Map:** Google Maps Platform connector (Managed by Lovable) — Maps JS API for rendering, Air Quality API via the connector gateway from server functions; browser key stays client-side, server key server-side
- **Server functions:** `getAirQualityGrid` (gateway call, cached), `submitReport`, `verifyReport` (stores tx signature) — all via `createServerFn`, authenticated ones with `requireSupabaseAuth`
- **Solana:** `@solana/web3.js` + wallet-adapter on devnet, memo program only; tx sent client-side after user approves in Phantom, signature saved to DB
- **Routes:** `/` (dashboard+map), `/reports`, `/about`, `/auth`; report submission under `_authenticated`
- Seed data: migration inserts a starter set of Houston neighborhood grid points so the demo is never empty

## Build order

1. Enable Lovable Cloud + connect Google Maps connector
2. DB schema + auth + seed data
3. Map dashboard with live AQI (the judging centerpiece)
4. Reports flow (submit → feed → map markers)
5. Solana wallet connect + verification badge
6. About/pitch page, head metadata, polish
