import { generateKeyPairSync, sign } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { createReviewerAdminMessage } from "@/lib/reviewer-admin-message";
import { verifyReviewerAdminAuthorization } from "@/lib/reviewer-admin.functions";

function signedAuthorization(input: {
  action: "list-pending-reviewers" | "approve-reviewer";
  requestId?: string;
  timestamp: number;
  trustedInviteConfirmed?: boolean;
}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicBytes = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const walletAddress = new PublicKey(publicBytes).toBase58();
  const message = createReviewerAdminMessage({
    ...input,
    wallet: walletAddress,
    nonce: "123e4567-e89b-42d3-a456-426614174000",
    trustedInviteConfirmed: input.trustedInviteConfirmed ?? input.action === "approve-reviewer",
  });
  const signature = sign(null, Buffer.from(message), privateKey).toString("base64");
  return { walletAddress, message, signature };
}

describe("reviewer admin authorization", () => {
  const requestId = "8f59e52d-0468-45df-8d77-42a90b717716";

  it("accepts a fresh signature from the configured wallet for the requested action", async () => {
    const now = Date.now();
    const signed = signedAuthorization({ action: "approve-reviewer", requestId, timestamp: now });
    await expect(
      verifyReviewerAdminAuthorization({
        ...signed,
        expectedAction: "approve-reviewer",
        expectedRequestId: requestId,
        trustedInviteConfirmed: true,
        now,
        adminWallet: signed.walletAddress,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a signature for a different request", async () => {
    const now = Date.now();
    const signed = signedAuthorization({ action: "approve-reviewer", requestId, timestamp: now });
    await expect(
      verifyReviewerAdminAuthorization({
        ...signed,
        expectedAction: "approve-reviewer",
        expectedRequestId: "ac9cf60c-80eb-44b2-8e28-839cf67f4b75",
        trustedInviteConfirmed: true,
        now,
        adminWallet: signed.walletAddress,
      }),
    ).rejects.toThrow("fresh signature");
  });

  it("rejects an approval without the signed pilot-trust confirmation", async () => {
    const now = Date.now();
    const signed = signedAuthorization({
      action: "approve-reviewer",
      requestId,
      timestamp: now,
      trustedInviteConfirmed: false,
    });
    await expect(
      verifyReviewerAdminAuthorization({
        ...signed,
        expectedAction: "approve-reviewer",
        expectedRequestId: requestId,
        trustedInviteConfirmed: false,
        now,
        adminWallet: signed.walletAddress,
      }),
    ).rejects.toThrow("fresh signature");
  });

  it("rejects expired signatures", async () => {
    const now = Date.now();
    const signed = signedAuthorization({
      action: "list-pending-reviewers",
      timestamp: now - 3 * 60 * 1000,
    });
    await expect(
      verifyReviewerAdminAuthorization({
        ...signed,
        expectedAction: "list-pending-reviewers",
        now,
        adminWallet: signed.walletAddress,
      }),
    ).rejects.toThrow("fresh signature");
  });
});
