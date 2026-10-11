import type { PublicKey, Transaction } from "@solana/web3.js";

export type SolanaWalletProvider = {
  isBraveWallet?: boolean;
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect?: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string }>;
};

function isSupportedProvider(
  provider: SolanaWalletProvider | undefined,
): provider is SolanaWalletProvider {
  return Boolean(provider && (provider.isBraveWallet || provider.isPhantom));
}

export function getSolanaWalletProvider(): SolanaWalletProvider | null {
  if (typeof window === "undefined") return null;

  const walletWindow = window as Window & {
    braveSolana?: SolanaWalletProvider;
    solana?: SolanaWalletProvider;
  };
  const preferred = walletWindow.solana;
  if (isSupportedProvider(preferred)) return preferred;

  const brave = walletWindow.braveSolana;
  return isSupportedProvider(brave) ? brave : null;
}

export function missingSolanaWalletMessage() {
  return "No Solana wallet was detected. In Brave, create or enable Brave Wallet, set it as your default crypto wallet, then reload Atlas.";
}
