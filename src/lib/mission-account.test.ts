import { describe, expect, it } from "vitest";
import { decodeMissionAccount } from "./mission-account";

function accountFixture(options: {
  participant?: number[];
  reviewer?: number[];
  previousReviewer?: number[];
  evidenceHash?: number[];
  status: number;
  reviewRound?: number;
  accepted?: boolean;
}) {
  const bytes = new Uint8Array(264);
  let offset = 8;
  const write = (value: number[]) => {
    bytes.set(value, offset);
    offset += value.length;
  };
  const option = (value: number[] | undefined, length: number) => {
    if (!value) {
      write([0]);
      return;
    }
    expect(value).toHaveLength(length);
    write([1, ...value]);
  };
  const integer = (value: bigint, signed = false) => {
    const field = new Uint8Array(8);
    const view = new DataView(field.buffer);
    if (signed) view.setBigInt64(0, value, true);
    else view.setBigUint64(0, value, true);
    write(Array.from(field));
  };

  write(Array.from({ length: 32 }, (_, index) => index + 1)); // sponsor
  option(options.participant, 32);
  option(options.reviewer, 32);
  option(options.previousReviewer, 32);
  write(Array.from({ length: 16 }, (_, index) => index + 33)); // mission id
  write(Array.from({ length: 32 }, (_, index) => index + 49)); // terms hash
  option(options.evidenceHash, 32);
  integer(50_000_000n);
  integer(1_800_000_000n, true);
  integer(1_800_000_100n, true);
  integer(1_800_000_200n, true);
  integer(1_800_000_300n, true);
  write([options.status, options.reviewRound ?? 0, options.accepted ? 1 : 0, 255]);
  return bytes;
}

describe("decodeMissionAccount", () => {
  it("reads funded accounts with absent optional fields", () => {
    const account = decodeMissionAccount(accountFixture({ status: 0 }));

    expect(account.status).toBe(0);
    expect(account.participant).toBeNull();
    expect(account.assignedReviewer).toBeNull();
    expect(account.evidenceHash).toBeNull();
    expect(account.submitBy).toBe(1_800_000_000n);
  });

  it("reads claimed status after a present participant option", () => {
    const participant = Array.from({ length: 32 }, (_, index) => index + 1);
    const account = decodeMissionAccount(accountFixture({ participant, status: 1 }));

    expect(account.status).toBe(1);
    expect(account.participant).toEqual(Uint8Array.from(participant));
  });

  it("follows variable-length participant and evidence options", () => {
    const participant = Array.from({ length: 32 }, (_, index) => 200 + index);
    const reviewer = Array.from({ length: 32 }, (_, index) => 100 + index);
    const evidenceHash = Array.from({ length: 32 }, (_, index) => 50 + index);
    const account = decodeMissionAccount(
      accountFixture({ participant, reviewer, evidenceHash, status: 2, reviewRound: 0 }),
    );

    expect(account.status).toBe(2);
    expect(account.participant).toEqual(Uint8Array.from(participant));
    expect(account.assignedReviewer).toEqual(Uint8Array.from(reviewer));
    expect(account.evidenceHash).toEqual(Uint8Array.from(evidenceHash));
  });

  it("rejects malformed option and status bytes", () => {
    const invalidOption = accountFixture({ status: 0 });
    invalidOption[40] = 2;
    expect(() => decodeMissionAccount(invalidOption)).toThrow("invalid option tag");

    const invalidStatus = accountFixture({ status: 8 });
    expect(() => decodeMissionAccount(invalidStatus)).toThrow("unknown status");
  });
});
