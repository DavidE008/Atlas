import { afterEach, describe, expect, it, vi } from "vitest";
import { getSolanaWalletProvider, type SolanaWalletProvider } from "./solana-wallet-provider";

type WalletWindow = Window & {
  braveSolana?: SolanaWalletProvider;
  solana?: SolanaWalletProvider;
};

const walletWindow = window as WalletWindow;

function fakeProvider(flags: Pick<SolanaWalletProvider, "isBraveWallet" | "isPhantom">) {
  return {
    ...flags,
    connect: vi.fn(),
    signAndSendTransaction: vi.fn(),
  } as unknown as SolanaWalletProvider;
}

afterEach(() => {
  delete walletWindow.braveSolana;
  delete walletWindow.solana;
});

describe("getSolanaWalletProvider", () => {
  it("recognizes Brave's named Solana provider", () => {
    const brave = fakeProvider({ isBraveWallet: true });
    walletWindow.braveSolana = brave;

    expect(getSolanaWalletProvider()).toBe(brave);
  });

  it("recognizes Brave's Phantom-compatible window.solana alias", () => {
    const brave = fakeProvider({ isPhantom: true });
    walletWindow.solana = brave;

    expect(getSolanaWalletProvider()).toBe(brave);
  });

  it("ignores an injected object that does not identify as a supported wallet", () => {
    walletWindow.solana = fakeProvider({});

    expect(getSolanaWalletProvider()).toBeNull();
  });
});
