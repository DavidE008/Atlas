import type { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer/";
import solanaScriptUrl from "@solana/web3.js/lib/index.iife.min.js?url";
import { getSolanaWalletProvider, missingSolanaWalletMessage } from "./solana-wallet-provider";
import { requireAuthenticatedWalletUser } from "./wallet-auth";
import { isProgramExecutable } from "./solana-program-status";

export const ATLAS_PROGRAM_ID = "FUjnUmo4QBtEeAEs2n5844zKfAN5sZP2MgbnFTiA3hFQ";
const DEVNET_RPC = "https://api.devnet.solana.com";
let sdkPromise: Promise<typeof import("@solana/web3.js")> | undefined;

export function isAtlasProgramDeployed() {
  return isProgramExecutable(ATLAS_PROGRAM_ID, DEVNET_RPC);
}

async function getWallet() {
  await requireAuthenticatedWalletUser();
  const provider = getSolanaWalletProvider();
  if (!provider) throw new Error(missingSolanaWalletMessage());
  return provider;
}

export async function connectMissionWallet() {
  const { publicKey } = await (await getWallet()).connect();
  return publicKey.toBase58();
}

function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = solanaScriptUrl;
    script.async = true;
    script.onload = () => {
      const sdk = (window as Window & { solanaWeb3?: typeof import("@solana/web3.js") }).solanaWeb3;
      if (sdk) resolve(sdk);
      else reject(new Error("Solana wallet tools did not initialize."));
    };
    script.onerror = () => reject(new Error("Solana wallet tools could not load."));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

const IX = {
  initializeConfig: new Uint8Array([208, 127, 21, 1, 194, 190, 196, 70]),
  renewAssignmentAuthority: new Uint8Array([10, 249, 158, 131, 157, 44, 129, 42]),
  create: new Uint8Array([15, 28, 105, 135, 65, 62, 188, 255]),
  claim: new Uint8Array([62, 198, 214, 193, 213, 159, 108, 210]),
  submit: new Uint8Array([12, 169, 228, 194, 229, 31, 44, 39]),
  assign: new Uint8Array([50, 160, 115, 122, 102, 108, 179, 201]),
  accept: new Uint8Array([162, 209, 28, 223, 46, 96, 89, 222]),
  decide: new Uint8Array([123, 125, 184, 125, 249, 43, 113, 15]),
  appeal: new Uint8Array([250, 91, 1, 244, 179, 52, 75, 236]),
  escalate: new Uint8Array([123, 99, 100, 10, 66, 238, 154, 23]),
  fallback: new Uint8Array([239, 183, 18, 95, 119, 38, 158, 5]),
  finalizeRejection: new Uint8Array([33, 120, 25, 204, 249, 2, 34, 239]),
  refund: new Uint8Array([118, 153, 164, 244, 40, 128, 242, 250]),
};

function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function intBytes(value: bigint, width: 8 | 16, signed = false) {
  const buffer = new ArrayBuffer(width);
  const view = new DataView(buffer);
  if (width === 8) {
    if (signed) view.setBigInt64(0, value, true);
    else view.setBigUint64(0, value, true);
  } else {
    if (value < 0n || value >= 1n << 128n) throw new Error("Invalid mission identifier.");
    let remaining = value;
    for (let i = 0; i < 16; i++) {
      view.setUint8(i, Number(remaining & 255n));
      remaining >>= 8n;
    }
  }
  return new Uint8Array(buffer);
}
function hexBytes(hex: string) {
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("Invalid mission identifier.");
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}
function solToLamports(value: string) {
  const [whole = "", fraction = ""] = value.trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d{0,9}$/.test(fraction))
    throw new Error("Enter a SOL reward with up to nine decimal places.");
  const lamports = BigInt(whole) * 1_000_000_000n + BigInt((fraction + "000000000").slice(0, 9));
  if (lamports <= 0n) throw new Error("The reward must be greater than zero.");
  return lamports;
}
async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer));
}
async function sendInstruction(
  ixData: Uint8Array,
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
) {
  const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } =
    await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const programId = new PublicKey(ATLAS_PROGRAM_ID);
  const instruction = new TransactionInstruction({
    programId,
    keys: keys.map((key) => ({ ...key })),
    data: Buffer.from(ixData) as unknown as NonNullable<
      ConstructorParameters<typeof TransactionInstruction>[0]["data"]
    >,
  });
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: publicKey, ...latest }).add(instruction);
  const { signature } = await provider.signAndSendTransaction(tx);
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return {
    signature,
    wallet: publicKey.toBase58(),
    PublicKey,
    SystemProgram,
    connection,
    programId,
  };
}
async function missionAddress(
  PublicKeyCtor: typeof import("@solana/web3.js").PublicKey,
  sponsor: string,
  missionId: string,
) {
  const sponsorKey = new PublicKeyCtor(sponsor);
  const [pda] = PublicKeyCtor.findProgramAddressSync(
    [Buffer.from("mission"), sponsorKey.toBuffer(), Buffer.from(hexBytes(missionId))],
    new PublicKeyCtor(ATLAS_PROGRAM_ID),
  );
  return { pda, sponsorKey };
}

export async function createFundedMission(input: {
  missionId: string;
  rewardSol: string;
  submitBy: number;
  terms: string;
}) {
  const { PublicKey, SystemProgram } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const mission = { hex: input.missionId.toLowerCase(), bytes: hexBytes(input.missionId) };
  const reward = solToLamports(input.rewardSol);
  const termsHash = await sha256(input.terms);
  const { pda } = await missionAddress(PublicKey, publicKey.toBase58(), mission.hex);
  const data = concat(
    IX.create,
    mission.bytes,
    termsHash,
    intBytes(reward, 8),
    intBytes(BigInt(input.submitBy), 8, true),
  );
  const result = await sendInstruction(data, [
    { pubkey: publicKey, isSigner: true, isWritable: true },
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ]);
  return {
    ...result,
    missionId: mission.hex,
    missionAddress: pda.toBase58(),
    termsHash: Buffer.from(termsHash).toString("hex"),
    rewardLamports: reward.toString(),
  };
}

export async function initializeMissionConfig(input: {
  assignmentAuthority: string;
  fallbackAuthority: string;
  assignmentExpiresAt: number;
}) {
  const { PublicKey, SystemProgram } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const programId = new PublicKey(ATLAS_PROGRAM_ID);
  const [programData] = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
  );
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const result = await sendInstruction(
    concat(
      IX.initializeConfig,
      new PublicKey(input.assignmentAuthority).toBytes(),
      new PublicKey(input.fallbackAuthority).toBytes(),
      intBytes(BigInt(input.assignmentExpiresAt), 8, true),
    ),
    [
      { pubkey: publicKey, isSigner: true, isWritable: true },
      { pubkey: programData, isSigner: false, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  );
  return { ...result, configAddress: config.toBase58() };
}

export async function readMissionConfig() {
  const { Connection, PublicKey } = await loadSdk();
  const programId = new PublicKey(ATLAS_PROGRAM_ID);
  const loaderId = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], loaderId);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const [programDataInfo, configInfo] = await Promise.all([
    connection.getAccountInfo(programData, "confirmed"),
    connection.getAccountInfo(config, "confirmed"),
  ]);
  const upgradeAuthority =
    programDataInfo?.data.length &&
    programDataInfo.data.length >= 45 &&
    programDataInfo.data[12] === 1
      ? new PublicKey(programDataInfo.data.subarray(13, 45)).toBase58()
      : null;
  if (!configInfo) return { configured: false, configAddress: config.toBase58(), upgradeAuthority };
  if (configInfo.data.length < 113)
    throw new Error("Atlas reviewer configuration has an invalid size.");
  return {
    configured: true,
    configAddress: config.toBase58(),
    upgradeAuthority,
    assignmentAuthority: new PublicKey(configInfo.data.subarray(40, 72)).toBase58(),
    fallbackAuthority: new PublicKey(configInfo.data.subarray(72, 104)).toBase58(),
    assignmentExpiresAt: Number(
      new DataView(
        configInfo.data.buffer,
        configInfo.data.byteOffset,
        configInfo.data.byteLength,
      ).getBigInt64(104, true),
    ),
  };
}

export async function renewMissionAssignmentAuthority(input: {
  assignmentAuthority: string;
  assignmentExpiresAt: number;
}) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const programId = new PublicKey(ATLAS_PROGRAM_ID);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const result = await sendInstruction(
    concat(
      IX.renewAssignmentAuthority,
      new PublicKey(input.assignmentAuthority).toBytes(),
      intBytes(BigInt(input.assignmentExpiresAt), 8, true),
    ),
    [
      { pubkey: publicKey, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
    ],
  );
  return { ...result, configAddress: config.toBase58() };
}

export async function claimMission(input: { sponsorWallet: string; missionId: string }) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(IX.claim, [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: publicKey, isSigner: true, isWritable: true },
  ]);
}

export async function submitMissionEvidence(input: {
  sponsorWallet: string;
  missionId: string;
  evidence: string;
}) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  const evidenceHash = await sha256(input.evidence);
  const result = await sendInstruction(concat(IX.submit, evidenceHash), [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: publicKey, isSigner: true, isWritable: false },
  ]);
  return { ...result, evidenceHash: Buffer.from(evidenceHash).toString("hex") };
}

export async function resolveMission(input: {
  sponsorWallet: string;
  missionId: string;
  participantWallet: string;
  approve: boolean;
}) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(concat(IX.decide, new Uint8Array([input.approve ? 1 : 0])), [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: publicKey, isSigner: true, isWritable: false },
    { pubkey: new PublicKey(input.participantWallet), isSigner: false, isWritable: true },
    { pubkey: new PublicKey(input.sponsorWallet), isSigner: false, isWritable: true },
  ]);
}

export async function assignMissionReviewer(input: {
  sponsorWallet: string;
  missionId: string;
  reviewerWallet: string;
}) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const programId = new PublicKey(ATLAS_PROGRAM_ID);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(concat(IX.assign, new PublicKey(input.reviewerWallet).toBytes()), [
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: publicKey, isSigner: true, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true },
  ]);
}

export async function acceptMissionReview(input: { sponsorWallet: string; missionId: string }) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(IX.accept, [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: publicKey, isSigner: true, isWritable: false },
  ]);
}

export async function appealMission(input: { sponsorWallet: string; missionId: string }) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(IX.appeal, [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: publicKey, isSigner: true, isWritable: false },
  ]);
}

export async function escalateMission(input: { sponsorWallet: string; missionId: string }) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const programId = new PublicKey(ATLAS_PROGRAM_ID);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(IX.escalate, [
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: publicKey, isSigner: true, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true },
  ]);
}

export async function resolveEscalatedMission(input: {
  sponsorWallet: string;
  missionId: string;
  participantWallet: string;
  approve: boolean;
}) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const programId = new PublicKey(ATLAS_PROGRAM_ID);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(concat(IX.fallback, new Uint8Array([input.approve ? 1 : 0])), [
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: publicKey, isSigner: true, isWritable: false },
    { pubkey: new PublicKey(input.participantWallet), isSigner: false, isWritable: true },
    { pubkey: new PublicKey(input.sponsorWallet), isSigner: false, isWritable: true },
  ]);
}

export async function finalizeMissionRejection(input: {
  sponsorWallet: string;
  missionId: string;
}) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(IX.finalizeRejection, [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: new PublicKey(input.sponsorWallet), isSigner: false, isWritable: true },
  ]);
}

export async function refundMission(input: { sponsorWallet: string; missionId: string }) {
  const { PublicKey } = await loadSdk();
  const provider = await getWallet();
  const { publicKey } = await provider.connect();
  const { pda } = await missionAddress(PublicKey, input.sponsorWallet, input.missionId);
  return sendInstruction(IX.refund, [
    { pubkey: pda, isSigner: false, isWritable: true },
    { pubkey: new PublicKey(input.sponsorWallet), isSigner: false, isWritable: true },
  ]);
}

export async function readMissionStatus(address: string) {
  const { Connection, PublicKey } = await loadSdk();
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const account = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  if (!account) return null;
  if (account.owner.toBase58() !== ATLAS_PROGRAM_ID || account.data.length < 264)
    throw new Error("Mission account is not owned by the Atlas program.");
  const status = account.data[260]!;
  return (
    (
      [
        "Funded",
        "Claimed",
        "Submitted",
        "Appealed",
        "RejectedPendingAppeal",
        "Escalated",
        "Paid",
        "RejectedFinal",
      ] as const
    )[status] ?? null
  );
}
