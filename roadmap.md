# AirWatch Houston — Build Roadmap

- [x] Enable Lovable Cloud
- [x] Connect Google Maps Platform connector
- [x] DB schema + RLS + seed data (profiles, reports, report_verifications, aq_grid_points)
- [x] Auth (email/password + Google) + /auth route
- [x] Design system (dark, map-first, AQI color tokens)
- [x] Dashboard `/`: map + live AQI grid + summary + health guidance
- [x] Reports `/reports`: submit (auth), feed, map markers, photo upload
- [x] Solana: wallet connect + devnet memo attestation + explorer badge
- [x] `/about` pitch page
- [x] Head metadata per route
- [x] GitHub: user connected the repository for automatic sync
- [ ] Rename the connected GitHub repository to atlas — user must rename in GitHub Settings → General; Git sync does not provide agent API access
- [x] Repair map initialization races and add loading, timeout, and authorization error states
- [ ] Confirm live Google Map rendering — user check on the Lovable preview required; live Maps checks are unavailable in the sandbox
- [x] Resolve Solana browser/server import errors; automatic build and routing test pass
- [x] Remove hackathon branding from the website and repository documentation; keep GitHub sync connected
