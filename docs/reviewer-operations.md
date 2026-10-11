# Atlas reviewer operations

## Volunteer approval

Volunteers request access from the Missions page while signed in and connected to the wallet they will use for reviews. The request is stored in `public.reviewer_enrollments`; it is private to the volunteer and service-role server code. An Atlas operator reviews requests in the Supabase dashboard and changes only the selected row's `status` from `pending` to `approved` (or `paused`/`rejected`). Confirm the wallet and conflict attestation out of band before approval. Reviewer aliases and account identity are never copied to public mission data.

## Assignment and fallback keys

Create a dedicated Devnet assignment key and keep its 64-byte JSON secret in Vercel as `ATLAS_ASSIGNMENT_KEYPAIR`. The server also needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; keep the service-role key server-only. The public address is registered in the Atlas program configuration. Fund that key with a small Devnet fee balance. The program limits this key to reviewer assignment and timeout escalation, and its authorization expires within seven days. Renew it from Atlas while connected with the program upgrade-authority wallet; if rotating to a new key, update the Vercel secret to match the new public address.

Choose a separate Atlas fallback wallet. It must be distinct from the upgrade authority and assignment key and should not be used as a mission sponsor, participant, or volunteer reviewer. Only this wallet can resolve a mission after the assignment service has put it into `Escalated`.

The upgrade-authority-only setup panel appears on Missions after the new program is deployed. It initializes the reviewer config once and later renews the restricted assignment key. A successful setup transaction does not install the server secret; configure that secret in Vercel separately, then redeploy the app.

## Review timing

Submissions close 72 hours after mission funding. The first reviewer gets 24 hours to accept and decide; a timeout offers one backup for another 24 hours. A rejection leaves escrow locked for a 24-hour appeal window. One appeal assigns a different final reviewer for up to 24 hours. If reviewers time out or the approved pool is empty after the applicable wait, the service marks the case escalated and the fallback wallet makes the final decision. Atlas fallback decisions are labeled explicitly in the app.

Sample missions must be labeled as Devnet examples. A paid sample is evidence that the escrow flow ran, not proof of environmental impact.
