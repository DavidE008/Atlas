# Atlas Missions program

A devnet escrow for one sponsor, one participant, and one designated reviewer.

## State flow

`Funded → Claimed → Submitted → Paid`

A reviewer rejection returns the reward to the sponsor. A permissionless expiry call refunds a mission after its submission deadline, or a submitted mission after its review deadline. Approval pays the promised reward; account rent goes back to the sponsor.

Mission terms and submitted evidence are represented by 32-byte SHA-256 commitments. Photos and human review remain off-chain. A commitment proves that data has not changed; it does not prove that cleanup occurred.

## Build and deploy

Install the Solana and Anchor toolchains, generate the program deploy keypair, update the program ID with `anchor keys sync`, then build and deploy to devnet. Keep the generated deploy keypair out of source control. Update the matching program address in the web client before enabling wallet actions.

This program has not been built or deployed to devnet yet.
