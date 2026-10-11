import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { ATLAS_ADMIN_WALLET, type ReviewerAdminAction } from "@/lib/reviewer-admin-message";

const MAX_AUTH_AGE_MS = 2 * 60 * 1000;

function decodeBase58(value: string) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let decoded = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("The operator wallet address is invalid.");
    decoded = decoded * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (decoded > 0n) {
    bytes.unshift(Number(decoded & 255n));
    decoded >>= 8n;
  }
  for (const character of value) {
    if (character !== "1") break;
    bytes.unshift(0);
  }
  if (bytes.length !== 32) throw new Error("The operator wallet address is invalid.");
  return new Uint8Array(bytes);
}

function adminClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Reviewer approval is not configured on the server.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export async function verifyReviewerAdminAuthorization(input: {
  walletAddress: string;
  message: string;
  signature: string;
  expectedAction: ReviewerAdminAction;
  expectedRequestId?: string;
  trustedInviteConfirmed?: boolean;
  now?: number;
  adminWallet?: string;
}) {
  const expectedWallet = input.adminWallet ?? ATLAS_ADMIN_WALLET;
  const lines = input.message.split("\n");
  const values = new Map(
    lines.slice(1).map((line) => {
      const separator = line.indexOf(": ");
      return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 2)];
    }),
  );
  const timestamp = Number(values.get("Timestamp"));
  const requestId = values.get("Request");
  const age = (input.now ?? Date.now()) - timestamp;
  if (
    lines[0] !== "Atlas reviewer operations authorization" ||
    values.get("Action") !== input.expectedAction ||
    values.get("Wallet") !== expectedWallet ||
    input.walletAddress !== expectedWallet ||
    !Number.isSafeInteger(timestamp) ||
    age < -30_000 ||
    age > MAX_AUTH_AGE_MS ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      values.get("Nonce") ?? "",
    ) ||
    (input.expectedRequestId ? requestId !== input.expectedRequestId : requestId !== "none") ||
    (input.expectedAction === "approve-reviewer" &&
      (input.trustedInviteConfirmed !== true ||
        values.get("Pilot trust confirmation") !== "confirmed")) ||
    !/^[A-Za-z0-9+/]{86}==$/.test(input.signature)
  ) {
    throw new Error("This action needs a fresh signature from the Atlas operator wallet.");
  }

  const publicKey = await globalThis.crypto.subtle.importKey(
    "raw",
    decodeBase58(expectedWallet),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const signatureBytes = Uint8Array.from(atob(input.signature), (character) =>
    character.charCodeAt(0),
  );
  const valid = await globalThis.crypto.subtle.verify(
    "Ed25519",
    publicKey,
    signatureBytes,
    new TextEncoder().encode(input.message),
  );
  if (!valid) throw new Error("The wallet signature could not be verified.");
}

const authorizationSchema = z.object({
  walletAddress: z.string().min(32).max(60),
  message: z.string().min(1).max(500),
  signature: z.string().min(80).max(100),
});

export const listPendingReviewerRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => authorizationSchema.parse(input))
  .handler(async ({ data }) => {
    await verifyReviewerAdminAuthorization({ ...data, expectedAction: "list-pending-reviewers" });
    const { data: requests, error } = await adminClient()
      .from("reviewer_enrollments" as never)
      .select("id,wallet_address,pseudonym,conflict_attested,status,created_at")
      .eq("status" as never, "pending" as never)
      .order("created_at" as never, { ascending: true });
    if (error) throw new Error("Could not load reviewer requests.");
    return (requests ?? []) as unknown as {
      id: string;
      wallet_address: string;
      pseudonym: string;
      conflict_attested: boolean;
      status: string;
      created_at: string;
    }[];
  });

const approveSchema = authorizationSchema.extend({
  id: z.string().uuid(),
  trustedInviteConfirmed: z.literal(true),
});

export const approveReviewerRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => approveSchema.parse(input))
  .handler(async ({ data }) => {
    await verifyReviewerAdminAuthorization({
      ...data,
      expectedAction: "approve-reviewer",
      expectedRequestId: data.id,
      trustedInviteConfirmed: data.trustedInviteConfirmed,
    });
    const { data: approved, error } = await adminClient()
      .from("reviewer_enrollments" as never)
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by_wallet: data.walletAddress,
        approval_basis: "pilot_trusted_invite",
      } as never)
      .eq("id" as never, data.id as never)
      .eq("status" as never, "pending" as never)
      .select("id,status")
      .maybeSingle();
    if (error) throw new Error("Could not approve this reviewer request.");
    if (!approved) throw new Error("This request is no longer pending. Refresh the list.");
    return { id: data.id, status: "approved" as const };
  });
