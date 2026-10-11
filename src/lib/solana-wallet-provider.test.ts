import { afterEach, describe, expect, it, vi } from "vitest";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import {
  getSolanaWalletProvider,
  listSolanaWalletProviders,
  selectSolanaWalletProvider,
  type SolanaWalletProvider,
} from "./solana-wallet-provider";

type WalletWindow = Window & {
  braveSolana?: SolanaWalletProvider;
  solana?: SolanaWalletProvider;
  solanaWeb3?: typeof import("@solana/web3.js");
};

const walletWindow = window as WalletWindow;
const unregisterWallets: Array<() => void> = [];

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
  delete walletWindow.solanaWeb3;
  window.localStorage.removeItem("atlas.selected-solana-wallet");
  unregisterWallets.splice(0).forEach((unregister) => unregister());
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

  it("discovers Wallet Standard providers that support Devnet signing", () => {
    const account = {
      address: "11111111111111111111111111111111",
      publicKey: new Uint8Array(32),
      chains: ["solana:devnet"],
      features: ["standard:connect", "solana:signAndSendTransaction"],
    };
    const wallet = {
      version: "1.0.0",
      name: "Atlas Test Wallet",
      icon: "data:image/png;base64,AA==",
      chains: ["solana:devnet"],
      accounts: [account],
      features: {
        "standard:connect": {
          version: "1.0.0",
          connect: vi.fn(async () => ({ accounts: [account] })),
        },
        "solana:signAndSendTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy"],
          signAndSendTransaction: vi.fn(),
        },
      },
    };
    unregisterWallets.push(getWallets().register(wallet as unknown as Wallet));

    expect(listSolanaWalletProviders()).toContainEqual({
      id: "standard:Atlas Test Wallet",
      name: "Atlas Test Wallet",
    });
    expect(getSolanaWalletProvider()).not.toBeNull();
  });

  it("connects and sends legacy transactions through a Wallet Standard provider", async () => {
    const account = {
      address: "11111111111111111111111111111111",
      publicKey: new Uint8Array(32),
      chains: ["solana:devnet"],
      features: ["standard:connect", "solana:signAndSendTransaction"],
    };
    const connect = vi.fn(async () => ({ accounts: [account] }));
    const signAndSendTransaction = vi.fn(async () => [{ signature: new Uint8Array([1]) }]);
    const wallet = {
      version: "1.0.0",
      name: "Signing Test Wallet",
      icon: "data:image/png;base64,AA==",
      chains: ["solana:devnet"],
      accounts: [account],
      features: {
        "standard:connect": { version: "1.0.0", connect },
        "solana:signAndSendTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy"],
          signAndSendTransaction,
        },
      },
    };
    class MockPublicKey {
      constructor(readonly address: string) {}
    }
    walletWindow.solanaWeb3 = {
      PublicKey: MockPublicKey,
    } as unknown as typeof import("@solana/web3.js");
    unregisterWallets.push(getWallets().register(wallet as unknown as Wallet));
    const provider = getSolanaWalletProvider();

    expect(provider).not.toBeNull();
    const connected = await provider!.connect();
    const sent = await provider!.signAndSendTransaction({
      serialize: () => new Uint8Array([5, 6]),
    } as never);

    expect((connected.publicKey as unknown as MockPublicKey).address).toBe(account.address);
    expect(signAndSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        account,
        transaction: new Uint8Array([5, 6]),
        chain: "solana:devnet",
      }),
    );
    expect(sent.signature).toBe("2");
  });

  it("uses the provider selected by the user", () => {
    const brave = fakeProvider({ isBraveWallet: true });
    const phantom = fakeProvider({ isPhantom: true });
    walletWindow.braveSolana = brave;
    walletWindow.solana = phantom;

    expect(selectSolanaWalletProvider("injected:phantom")).toBe(true);
    expect(getSolanaWalletProvider()).toBe(phantom);
  });
});
