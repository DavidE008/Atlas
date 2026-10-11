# Atlas Missions program

A devnet escrow for one sponsor, one participant, and one designated reviewer.

## State flow

`Funded → Claimed → Submitted → Paid`

A reviewer rejection returns the reward to the sponsor. A permissionless expiry call refunds a mission after its submission deadline, or a submitted mission after its review deadline. Approval pays the promised reward; account rent goes back to the sponsor.

Mission terms and submitted evidence are represented by 32-byte SHA-256 commitments. Photos and human review remain off-chain. A commitment proves that data has not changed; it does not prove that cleanup occurred.

## Build and deploy

For a new deployment, install the Solana and Anchor toolchains, generate a deploy keypair, sync the program ID, then build and deploy to Devnet. Keep the generated deploy keypair outside source control and update the matching address in the web client.

The program is deployed and executable on Solana Devnet at
`FUjnUmo4QBtEeAEs2n5844zKfAN5sZP2MgbnFTiA3hFQ`. Keep this address aligned with `Anchor.toml` and
`src/lib/atlas-missions.ts`. The Atlas mission page checks the program account and displays its
Devnet availability. Deployment keys must remain outside the repository.
