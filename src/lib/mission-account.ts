export type DecodedMissionAccount = {
  sponsor: Uint8Array;
  participant: Uint8Array | null;
  assignedReviewer: Uint8Array | null;
  previousReviewer: Uint8Array | null;
  missionId: Uint8Array;
  termsHash: Uint8Array;
  evidenceHash: Uint8Array | null;
  rewardLamports: bigint;
  submitBy: bigint;
  assignmentDeadline: bigint;
  appealDeadline: bigint;
  createdAt: bigint;
  status: number;
  reviewRound: number;
  accepted: boolean;
  bump: number;
};

/**
 * Decode the Anchor/Borsh mission account. Option values are variable length:
 * None occupies one byte, while Some(Pubkey) occupies 33 bytes.
 */
export function decodeMissionAccount(data: Uint8Array): DecodedMissionAccount {
  let offset = 8; // Anchor account discriminator

  const take = (length: number) => {
    if (offset + length > data.length) throw new Error("Mission account data is truncated.");
    const value = data.slice(offset, offset + length);
    offset += length;
    return value;
  };

  const takeOption = (length: number) => {
    const [tag] = take(1);
    if (tag === 0) return null;
    if (tag !== 1) throw new Error("Mission account contains an invalid option tag.");
    return take(length);
  };

  const takeInteger = (length: number, signed = false) => {
    const bytes = take(length);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return length === 8
      ? signed
        ? view.getBigInt64(0, true)
        : view.getBigUint64(0, true)
      : BigInt(bytes[0] ?? 0);
  };

  const sponsor = take(32);
  const participant = takeOption(32);
  const assignedReviewer = takeOption(32);
  const previousReviewer = takeOption(32);
  const missionId = take(16);
  const termsHash = take(32);
  const evidenceHash = takeOption(32);
  const rewardLamports = takeInteger(8);
  const submitBy = takeInteger(8, true);
  const assignmentDeadline = takeInteger(8, true);
  const appealDeadline = takeInteger(8, true);
  const createdAt = takeInteger(8, true);
  const status = Number(takeInteger(1));
  const reviewRound = Number(takeInteger(1));
  const acceptedValue = Number(takeInteger(1));
  const bump = Number(takeInteger(1));

  if (status > 7) throw new Error("Mission account contains an unknown status.");
  if (acceptedValue > 1) throw new Error("Mission account contains an invalid acceptance flag.");

  return {
    sponsor,
    participant,
    assignedReviewer,
    previousReviewer,
    missionId,
    termsHash,
    evidenceHash,
    rewardLamports,
    submitBy,
    assignmentDeadline,
    appealDeadline,
    createdAt,
    status,
    reviewRound,
    accepted: acceptedValue === 1,
    bump,
  };
}
