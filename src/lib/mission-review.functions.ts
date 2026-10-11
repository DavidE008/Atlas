import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { decodeMissionAccount } from "@/lib/mission-account";

const PROGRAM_ID = "FUjnUmo4QBtEeAEs2n5844zKfAN5sZP2MgbnFTiA3hFQ";
const DEVNET_RPC = process.env["SOLANA_RPC_URL"] || "https://api.devnet.solana.com";
const REVIEW_WINDOW_SECONDS = 24 * 60 * 60;
const ixAssign = new Uint8Array([50, 160, 115, 122, 102, 108, 179, 201]);
const ixEscalate = new Uint8Array([123, 99, 100, 10, 66, 238, 154, 23]);
const ixDecide = new Uint8Array([123, 125, 184, 125, 249, 43, 113, 15]);
const ixAppeal = new Uint8Array([250, 91, 1, 244, 179, 52, 75, 236]);
const ixFallback = new Uint8Array([239, 183, 18, 95, 119, 38, 158, 5]);

function adminClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Reviewer assignment is not configured on the server.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function decodeBase58(value: string) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let integer = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid Solana transaction data.");
    integer = integer * 58n + BigInt(digit);
  }
  const decoded: number[] = [];
  while (integer > 0n) {
    decoded.push(Number(integer & 255n));
    integer >>= 8n;
  }
  let leadingZeroes = 0;
  while (value[leadingZeroes] === "1") leadingZeroes++;
  return Uint8Array.from([...new Array<number>(leadingZeroes).fill(0), ...decoded.reverse()]);
}

async function verifySignedProgramAction(
  signature: string,
  expectedSigner: string,
  expectedMissionAddress: string,
  discriminator: Uint8Array,
  argument?: number,
) {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const tx = await new Connection(DEVNET_RPC, "confirmed").getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || tx.meta?.err) throw new Error("The Solana transaction is not confirmed successfully.");
  const message = tx.transaction.message;
  const accountKeys = "accountKeys" in message ? message.accountKeys : message.staticAccountKeys;
  const instructions =
    "instructions" in message ? message.instructions : message.compiledInstructions;
  const signer = accountKeys.some(
    (key, index) =>
      key.toBase58() === expectedSigner &&
      index < tx.transaction.message.header.numRequiredSignatures,
  );
  if (!signer) throw new Error("The transaction was not signed by the assigned wallet.");
  const missionIndex = accountKeys.findIndex((key) => key.toBase58() === expectedMissionAddress);
  if (missionIndex < 0) throw new Error("The transaction does not reference this mission.");
  const instruction = instructions.find((item) => {
    const program = accountKeys[item.programIdIndex];
    if (!program || !program.equals(new PublicKey(PROGRAM_ID))) return false;
    const bytes = typeof item.data === "string" ? decodeBase58(item.data) : item.data;
    return (
      bytesEqual(bytes.subarray(0, discriminator.length), discriminator) &&
      (argument === undefined || bytes[discriminator.length] === argument) &&
      ("accountKeyIndexes" in item ? item.accountKeyIndexes : item.accounts).includes(missionIndex)
    );
  });
  if (!instruction)
    throw new Error("The confirmed transaction does not contain the expected Atlas action.");
}

async function assignmentKeypair() {
  const raw = process.env["ATLAS_ASSIGNMENT_KEYPAIR"];
  if (!raw) throw new Error("Atlas reviewer assignment is not configured yet.");
  const { Keypair } = await import("@solana/web3.js");
  let secret: unknown;
  try {
    secret = JSON.parse(raw);
  } catch {
    throw new Error("Atlas assignment key configuration is invalid.");
  }
  if (!Array.isArray(secret) || secret.length !== 64 || secret.some((b) => typeof b !== "number"))
    throw new Error("Atlas assignment key configuration is invalid.");
  return { Keypair, keypair: Keypair.fromSecretKey(Uint8Array.from(secret as number[])) };
}

async function sendAssignmentInstruction(input: {
  sponsor: string;
  missionKey: string;
  reviewer?: string;
  escalate: boolean;
}) {
  const [{ Connection, PublicKey, Transaction, TransactionInstruction }, auth] = await Promise.all([
    import("@solana/web3.js"),
    assignmentKeypair(),
  ]);
  const program = new PublicKey(PROGRAM_ID);
  const sponsor = new PublicKey(input.sponsor);
  const missionId = Uint8Array.from(
    input.missionKey.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16)),
  );
  const [mission] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("mission"), sponsor.toBytes(), missionId],
    program,
  );
  const [config] = PublicKey.findProgramAddressSync([new TextEncoder().encode("config")], program);
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const configInfo = await connection.getAccountInfo(config, "confirmed");
  if (
    !configInfo ||
    configInfo.data.length < 113 ||
    !bytesEqual(configInfo.data.subarray(40, 72), auth.keypair.publicKey.toBytes())
  )
    throw new Error("The assignment key does not match Atlas program configuration.");
  const assignmentExpiresAt = Number(
    new DataView(
      configInfo.data.buffer,
      configInfo.data.byteOffset,
      configInfo.data.byteLength,
    ).getBigInt64(104, true),
  );
  if (assignmentExpiresAt < Math.floor(Date.now() / 1000))
    throw new Error(
      "Atlas assignment authority expired. The program upgrade authority must renew it.",
    );
  const keys = input.escalate
    ? [
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: auth.keypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: mission, isSigner: false, isWritable: true },
      ]
    : [
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: auth.keypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: mission, isSigner: false, isWritable: true },
      ];
  const ix = new TransactionInstruction({
    programId: program,
    keys,
    data: Buffer.from(
      input.escalate
        ? ixEscalate
        : new Uint8Array([...ixAssign, ...new PublicKey(input.reviewer!).toBytes()]),
    ),
  });
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: auth.keypair.publicKey, ...latest }).add(ix);
  tx.sign(auth.keypair);
  const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}

const enrollSchema = z.object({
  walletAddress: z.string().min(32).max(60),
  pseudonym: z.string().trim().min(2).max(40),
  conflictAttested: z.literal(true),
});

export const enrollAsReviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => enrollSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = adminClient();
    const { data: row, error } = await db
      .from("reviewer_enrollments" as never)
      .insert({
        user_id: context.userId,
        wallet_address: data.walletAddress,
        pseudonym: data.pseudonym,
        conflict_attested: true,
      } as never)
      .select("status")
      .single();
    if (error)
      throw new Error(
        error.code === "23505" ? "This account or wallet is already enrolled." : error.message,
      );
    return { status: (row as { status: string }).status };
  });

export const listMyReviewAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mission_review_assignments" as never)
      .select("mission_id, reviewer_wallet, review_round, status, deadline, tx_signature")
      .eq("reviewer_user_id" as never, context.userId as never)
      .in("status" as never, ["assigned", "accepted"] as never)
      .order("assigned_at" as never, { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as {
      mission_id: string;
      reviewer_wallet: string;
      review_round: number;
      status: string;
      deadline: string;
      tx_signature: string | null;
    }[];
  });

const advanceSchema = z.object({ missionId: z.string().uuid() });

export const advanceMissionReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => advanceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = adminClient();
    const { data: mission, error: missionError } = await db
      .from("missions")
      .select(
        "id, created_by, mission_key, sponsor_wallet, mission_address, submit_by, appealed_at",
      )
      .eq("id", data.missionId)
      .not("mission_address", "is", null)
      .single();
    if (missionError || !mission) throw new Error("Mission not found.");
    const { data: submission } = await db
      .from("mission_submissions" as never)
      .select("user_id, participant_wallet, created_at")
      .eq("mission_id" as never, data.missionId as never)
      .maybeSingle();
    if (!submission) throw new Error("Mission evidence has not been submitted.");
    const callerIsParticipant = (submission as { user_id: string }).user_id === context.userId;
    const callerIsSponsor = (mission as { created_by: string }).created_by === context.userId;
    const { count: callerAssignmentCount } = await db
      .from("mission_review_assignments" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("mission_id" as never, data.missionId as never)
      .eq("reviewer_user_id" as never, context.userId as never);
    if (!callerIsParticipant && !callerIsSponsor && !callerAssignmentCount)
      throw new Error(
        "Only this mission’s participant, sponsor, or assigned reviewer can advance its review.",
      );

    const { Connection, PublicKey } = await import("@solana/web3.js");
    const conn = new Connection(DEVNET_RPC, "confirmed");
    const address = new PublicKey((mission as { mission_address: string }).mission_address);
    const info = await conn.getAccountInfo(address, "confirmed");
    if (!info || !bytesEqual(info.owner.toBytes(), new PublicKey(PROGRAM_ID).toBytes()))
      throw new Error("Mission is not active on the Atlas program.");
    const account = decodeMissionAccount(info.data);
    const state = account.status;
    const round = account.reviewRound;
    const reviewerPresent = account.assignedReviewer !== null;
    const assignmentDeadline = Number(account.assignmentDeadline);
    const now = Math.floor(Date.now() / 1000);
    if (state !== 2 && state !== 3) return { status: state === 5 ? "escalated" : "not_reviewable" };

    const { data: latestRows, error: assignmentError } = await db
      .from("mission_review_assignments" as never)
      .select("review_round, reviewer_wallet, reviewer_user_id, status, deadline")
      .eq("mission_id" as never, data.missionId as never)
      .order("review_round" as never, { ascending: false })
      .limit(1);
    if (assignmentError) throw new Error(assignmentError.message);
    const latest = (latestRows?.[0] ?? null) as unknown as {
      review_round: number;
      reviewer_wallet: string;
      reviewer_user_id: string;
      status: string;
      deadline: string;
    } | null;

    if (reviewerPresent && (!latest || Date.parse(latest.deadline) > Date.now())) {
      return {
        status: latest?.status ?? "assigned",
        deadline: latest?.deadline ?? new Date(assignmentDeadline * 1000).toISOString(),
      };
    }
    if (reviewerPresent && assignmentDeadline >= now)
      return { status: "assigned", deadline: new Date(assignmentDeadline * 1000).toISOString() };

    if (reviewerPresent && state === 3) {
      await sendAssignmentInstruction({
        sponsor: (mission as { sponsor_wallet: string }).sponsor_wallet,
        missionKey: (mission as { mission_key: string }).mission_key,
        escalate: true,
      });
      if (latest)
        await db
          .from("mission_review_assignments" as never)
          .update({ status: "timed_out" } as never)
          .eq("mission_id" as never, data.missionId as never)
          .eq("review_round" as never, latest.review_round as never);
      return { status: "escalated" };
    }

    if (reviewerPresent && state === 2 && round >= 1) {
      await sendAssignmentInstruction({
        sponsor: (mission as { sponsor_wallet: string }).sponsor_wallet,
        missionKey: (mission as { mission_key: string }).mission_key,
        escalate: true,
      });
      if (latest)
        await db
          .from("mission_review_assignments" as never)
          .update({ status: "timed_out" } as never)
          .eq("mission_id" as never, data.missionId as never)
          .eq("review_round" as never, latest.review_round as never);
      return { status: "escalated" };
    }

    const excluded = [
      (mission as { sponsor_wallet: string }).sponsor_wallet,
      (submission as { participant_wallet: string }).participant_wallet,
      ...(account.previousReviewer ? [new PublicKey(account.previousReviewer).toBase58()] : []),
    ];
    const { data: candidates, error: candidateError } = await db.rpc(
      "claim_next_mission_reviewer" as never,
      {
        excluded_wallets: excluded,
      } as never,
    );
    if (candidateError) throw new Error(candidateError.message);
    const reviewer = (candidates?.[0] ?? null) as unknown as {
      reviewer_user_id: string;
      wallet_address: string;
    } | null;

    if (!reviewer) {
      const appealStarted = (mission as { appealed_at?: string | null }).appealed_at;
      const waitFrom =
        state === 3 ? appealStarted : (submission as { created_at: string }).created_at;
      const elapsed = waitFrom ? Date.now() - Date.parse(waitFrom) : 0;
      if (!reviewerPresent && elapsed < REVIEW_WINDOW_SECONDS * 1000)
        return { status: "waiting_for_review_pool" };
      if (reviewerPresent && now <= assignmentDeadline)
        return { status: "assigned", deadline: new Date(assignmentDeadline * 1000).toISOString() };
      await sendAssignmentInstruction({
        sponsor: (mission as { sponsor_wallet: string }).sponsor_wallet,
        missionKey: (mission as { mission_key: string }).mission_key,
        escalate: true,
      });
      if (latest)
        await db
          .from("mission_review_assignments" as never)
          .update({ status: "timed_out" } as never)
          .eq("mission_id" as never, data.missionId as never)
          .eq("review_round" as never, latest.review_round as never);
      return { status: "escalated" };
    }

    const nextRound = state === 3 ? 2 : reviewerPresent ? round + 1 : 0;
    if (latest)
      await db
        .from("mission_review_assignments" as never)
        .update({ status: "timed_out" } as never)
        .eq("mission_id" as never, data.missionId as never)
        .eq("review_round" as never, latest.review_round as never);
    const deadline = new Date(Date.now() + REVIEW_WINDOW_SECONDS * 1000).toISOString();
    const { data: reserved, error: insertError } = await db
      .from("mission_review_assignments" as never)
      .insert({
        mission_id: data.missionId,
        reviewer_user_id: reviewer.reviewer_user_id,
        reviewer_wallet: reviewer.wallet_address,
        review_round: nextRound,
        status: "assigned",
        deadline,
      } as never)
      .select("id")
      .single();
    if (insertError?.code === "23505") return { status: "assigned", deadline };
    if (insertError) throw new Error("The private reviewer assignment could not be reserved.");
    try {
      const signature = await sendAssignmentInstruction({
        sponsor: (mission as { sponsor_wallet: string }).sponsor_wallet,
        missionKey: (mission as { mission_key: string }).mission_key,
        reviewer: reviewer.wallet_address,
        escalate: false,
      });
      await db
        .from("mission_review_assignments" as never)
        .update({ tx_signature: signature } as never)
        .eq("id" as never, (reserved as { id: string }).id as never);
    } catch (error) {
      await db
        .from("mission_review_assignments" as never)
        .delete()
        .eq("id" as never, (reserved as { id: string }).id as never);
      throw error;
    }
    return {
      status: "assigned",
      deadline,
    };
  });

export const markMissionReviewAccepted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => advanceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = adminClient();
    const { data: rows, error } = await db
      .from("mission_review_assignments" as never)
      .select("id, status, reviewer_wallet, mission_id")
      .eq("mission_id" as never, data.missionId as never)
      .eq("reviewer_user_id" as never, context.userId as never)
      .order("review_round" as never, { ascending: false })
      .limit(1);
    if (error || !rows?.[0])
      throw new Error("This Atlas account does not hold the reviewer assignment.");
    const row = rows[0] as {
      id: string;
      status: string;
      reviewer_wallet: string;
      mission_id: string;
    };
    if (row.status !== "assigned") throw new Error("This reviewer assignment is no longer active.");
    const { data: mission, error: missionError } = await db
      .from("missions")
      .select("mission_address")
      .eq("id", row.mission_id)
      .single();
    if (missionError || !mission?.mission_address) throw new Error("Mission not found.");
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const info = await new Connection(DEVNET_RPC, "confirmed").getAccountInfo(
      new PublicKey(mission.mission_address),
      "confirmed",
    );
    if (!info) throw new Error("On-chain reviewer acceptance could not be verified.");
    const account = decodeMissionAccount(info.data);
    if (
      !account.assignedReviewer ||
      !account.accepted ||
      new PublicKey(account.assignedReviewer).toBase58() !== row.reviewer_wallet
    )
      throw new Error("On-chain reviewer acceptance could not be verified.");
    const { error: updateError } = await db
      .from("mission_review_assignments" as never)
      .update({ status: "accepted", accepted_at: new Date().toISOString() } as never)
      .eq("id" as never, row.id as never);
    if (updateError) throw new Error(updateError.message);
    return { status: "accepted" };
  });

const decisionSchema = z.object({
  missionId: z.string().uuid(),
  approve: z.boolean(),
  txSignature: z.string().min(64).max(100),
});

export const recordMissionDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = adminClient();
    const { data: assignments, error } = await db
      .from("mission_review_assignments" as never)
      .select("id, reviewer_wallet, review_round, status")
      .eq("mission_id" as never, data.missionId as never)
      .eq("reviewer_user_id" as never, context.userId as never)
      .order("review_round" as never, { ascending: false })
      .limit(1);
    const assignment = assignments?.[0] as
      { id: string; reviewer_wallet: string; review_round: number; status: string } | undefined;
    if (error || !assignment || assignment.status !== "accepted")
      throw new Error("An accepted reviewer assignment is required.");
    const { data: mission, error: missionError } = await db
      .from("missions")
      .select("mission_address")
      .eq("id", data.missionId)
      .single();
    if (missionError || !mission?.mission_address) throw new Error("Mission not found.");
    await verifySignedProgramAction(
      data.txSignature,
      assignment.reviewer_wallet,
      mission.mission_address,
      ixDecide,
      data.approve ? 1 : 0,
    );
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const account = await new Connection(DEVNET_RPC, "confirmed").getAccountInfo(
      new PublicKey(mission.mission_address),
      "confirmed",
    );
    if (data.approve && account) throw new Error("Approved escrow has not closed on-chain.");
    if (
      !data.approve &&
      (!account ||
        decodeMissionAccount(account.data).status !== (assignment.review_round === 2 ? 7 : 4))
    )
      throw new Error("The on-chain rejection state could not be verified.");
    const { error: updateAssignmentError } = await db
      .from("mission_review_assignments" as never)
      .update({
        status: "decided",
        decision: data.approve ? "approved" : "rejected",
        decided_at: new Date().toISOString(),
        tx_signature: data.txSignature,
      } as never)
      .eq("id" as never, assignment.id as never);
    if (updateAssignmentError) throw new Error(updateAssignmentError.message);
    const { error: updateMissionError } = await db
      .from("missions")
      .update({
        settlement_status: data.approve
          ? "Paid"
          : assignment.review_round === 2
            ? "RejectedFinal"
            : "RejectedPendingAppeal",
        settlement_tx_signature: data.txSignature,
      })
      .eq("id", data.missionId);
    if (updateMissionError)
      throw new Error("Review was recorded on-chain, but Atlas could not save its status.");
    return {
      status: data.approve
        ? "Paid"
        : assignment.review_round === 2
          ? "RejectedFinal"
          : "RejectedPendingAppeal",
    };
  });

export const recordMissionAppeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ missionId: z.string().uuid(), txSignature: z.string().min(64).max(100) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = adminClient();
    const { data: submission, error } = await db
      .from("mission_submissions" as never)
      .select("user_id, participant_wallet")
      .eq("mission_id" as never, data.missionId as never)
      .single();
    if (error || !submission || (submission as { user_id: string }).user_id !== context.userId)
      throw new Error("Only the participant may appeal this mission.");
    const { data: mission, error: missionError } = await db
      .from("missions")
      .select("mission_address")
      .eq("id", data.missionId)
      .single();
    if (missionError || !mission?.mission_address) throw new Error("Mission not found.");
    await verifySignedProgramAction(
      data.txSignature,
      (submission as { participant_wallet: string }).participant_wallet,
      mission.mission_address,
      ixAppeal,
    );
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const onchain = await new Connection(DEVNET_RPC, "confirmed").getAccountInfo(
      new PublicKey(mission.mission_address),
      "confirmed",
    );
    if (!onchain || decodeMissionAccount(onchain.data).status !== 3)
      throw new Error("The appeal state could not be verified on-chain.");
    const { error: updateError } = await db
      .from("missions")
      .update({
        appealed_at: new Date().toISOString(),
        appeal_tx_signature: data.txSignature,
        settlement_status: "Appealed",
      })
      .eq("id", data.missionId);
    if (updateError)
      throw new Error("Appeal was recorded on-chain, but Atlas could not save its receipt.");
    return { status: "Appealed" };
  });

export const recordFallbackDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => decisionSchema.parse(input))
  .handler(async ({ data }) => {
    const db = adminClient();
    const { data: mission, error } = await db
      .from("missions")
      .select("mission_address")
      .eq("id", data.missionId)
      .single();
    if (error || !mission?.mission_address) throw new Error("Mission not found.");
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const conn = new Connection(DEVNET_RPC, "confirmed");
    const { Keypair } = await import("@solana/web3.js");
    const signer = await conn.getTransaction(data.txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!signer || signer.meta?.err) throw new Error("Fallback transaction is not confirmed.");
    const message = signer.transaction.message;
    const keys = "accountKeys" in message ? message.accountKeys : message.staticAccountKeys;
    const instructions =
      "instructions" in message ? message.instructions : message.compiledInstructions;
    const [config] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("config")],
      new PublicKey(PROGRAM_ID),
    );
    const configInfo = await conn.getAccountInfo(config, "confirmed");
    if (!configInfo || configInfo.data.length < 113)
      throw new Error("Atlas fallback configuration is missing.");
    const fallbackWallet = new PublicKey(configInfo.data.subarray(72, 104)).toBase58();
    if (
      !keys.some(
        (key, index) =>
          key.toBase58() === fallbackWallet &&
          index < signer.transaction.message.header.numRequiredSignatures,
      )
    )
      throw new Error("Only the configured Atlas fallback wallet can record this decision.");
    const missionIndex = keys.findIndex((key) => key.toBase58() === mission.mission_address);
    const instruction = instructions.find((item) => {
      const program = keys[item.programIdIndex];
      if (!program?.equals(new PublicKey(PROGRAM_ID))) return false;
      const bytes = typeof item.data === "string" ? decodeBase58(item.data) : item.data;
      return (
        bytesEqual(bytes.subarray(0, ixFallback.length), ixFallback) &&
        bytes[ixFallback.length] === (data.approve ? 1 : 0) &&
        ("accountKeyIndexes" in item ? item.accountKeyIndexes : item.accounts).includes(
          missionIndex,
        )
      );
    });
    if (!instruction)
      throw new Error("Fallback transaction does not contain an Atlas fallback decision.");
    const account = await conn.getAccountInfo(new PublicKey(mission.mission_address), "confirmed");
    if (account) throw new Error("Fallback escrow has not closed on-chain.");
    const status = data.approve ? "Paid" : "RejectedFinal";
    const { error: updateError } = await db
      .from("missions")
      .update({ settlement_status: status, settlement_tx_signature: data.txSignature })
      .eq("id", data.missionId);
    if (updateError)
      throw new Error(
        "Fallback resolution was confirmed on-chain, but Atlas could not save its receipt.",
      );
    return { status };
  });
