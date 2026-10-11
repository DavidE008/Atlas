import { describe, expect, it, vi } from "vitest";
import { isProgramExecutable } from "./solana-program-status";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe("isProgramExecutable", () => {
  it("checks the account info for a program on the configured RPC", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ result: { value: { executable: true } } }));

    await expect(
      isProgramExecutable("atlas-program", "https://rpc.example", fetcher),
    ).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith("https://rpc.example", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: ["atlas-program", { encoding: "base64", commitment: "confirmed" }],
      }),
    });
  });

  it("reports a missing or non-executable account as not deployed", async () => {
    await expect(
      isProgramExecutable("atlas-program", "https://rpc.example", async () =>
        jsonResponse({ result: { value: null } }),
      ),
    ).resolves.toBe(false);
    await expect(
      isProgramExecutable("atlas-program", "https://rpc.example", async () =>
        jsonResponse({ result: { value: { executable: false } } }),
      ),
    ).resolves.toBe(false);
  });

  it("surfaces RPC errors", async () => {
    await expect(
      isProgramExecutable("atlas-program", "https://rpc.example", async () =>
        jsonResponse({ result: { value: null } }, false),
      ),
    ).rejects.toThrow("Devnet program status is unavailable.");
    await expect(
      isProgramExecutable("atlas-program", "https://rpc.example", async () =>
        jsonResponse({ error: { message: "Rate limited" } }),
      ),
    ).rejects.toThrow("Rate limited");
  });
});
