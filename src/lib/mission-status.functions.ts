import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { decodeMissionAccount } from "@/lib/mission-account";

const PROGRAM_ID = "FUjnUmo4QBtEeAEs2n5844zKfAN5sZP2MgbnFTiA3hFQ";
const STATUS_NAMES = [
  "Funded",
  "Claimed",
  "Submitted",
  "Appealed",
  "RejectedPendingAppeal",
  "Escalated",
  "Paid",
  "RejectedFinal",
] as const;

// Public browsing needs status only. Keep RPC credentials and full account data server-side.
export const readMissionStatuses = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        addresses: z.array(z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!data.addresses.length) return [];
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const connection = new Connection(
      process.env["SOLANA_RPC_URL"] || "https://api.devnet.solana.com",
      "confirmed",
    );
    let accounts;
    try {
      accounts = await connection.getMultipleAccountsInfo(
        data.addresses.map((address) => new PublicKey(address)),
      );
    } catch {
      throw new Error("Devnet status could not be refreshed. Please try Refresh chain again.");
    }
    return accounts.map((account, index) => {
      let status: string | null = null;
      if (account?.owner.toBase58() === PROGRAM_ID) {
        try {
          status = STATUS_NAMES[decodeMissionAccount(account.data).status] ?? null;
        } catch {
          // One invalid account must not prevent other missions from loading.
        }
      }
      return { address: data.addresses[index], status };
    });
  });
