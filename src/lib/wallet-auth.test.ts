import { afterEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser } },
}));

import { requireAuthenticatedWalletUser } from "./wallet-auth";

afterEach(() => getUser.mockReset());

describe("requireAuthenticatedWalletUser", () => {
  it("returns the signed-in Atlas user", async () => {
    const user = { id: "atlas-user" };
    getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(requireAuthenticatedWalletUser()).resolves.toBe(user);
  });

  it("blocks wallet access when no Atlas account is signed in", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireAuthenticatedWalletUser()).rejects.toThrow(
      "Create an Atlas account or sign in before connecting a wallet.",
    );
  });

  it("blocks wallet access when the session cannot be verified", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("Session expired") });

    await expect(requireAuthenticatedWalletUser()).rejects.toThrow(
      "Create an Atlas account or sign in before connecting a wallet.",
    );
  });
});
