// Solana browser wallet integration + devnet memo attestation.
// Browser-only module — never import from server code.

import solanaScriptUrl from "@solana/web3.js/lib/index.iife.min.js?url";
import {
  getSolanaWalletProvider,
  missingSolanaWalletMessage,
  selectSolanaWalletProvider,
} from "./solana-wallet-provider";
import { requireAuthenticatedWalletUser } from "./wallet-auth";

const DEVNET_RPC = "https://api.devnet.solana.com";
let sdkPromise: Promise<typeof import("@solana/web3.js")> | undefined;

function loadSolanaSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<typeof import("@solana/web3.js")>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = solanaScriptUrl;
    script.async = true;
    script.onload = () => {
      const sdk = (window as unknown as { solanaWeb3?: typeof import("@solana/web3.js") })
        .solanaWeb3;
      if (sdk) resolve(sdk);
      else reject(new Error("Solana wallet tools could not initialize."));
    };
    script.onerror = () => reject(new Error("Solana wallet tools could not load."));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function getWallet() {
  return getSolanaWalletProvider();
}

export function isSolanaWalletAvailable(): boolean {
  return getWallet() != null;
}

export async function connectWallet(providerId?: string): Promise<string> {
  await requireAuthenticatedWalletUser();
  if (providerId && !selectSolanaWalletProvider(providerId)) {
    throw new Error("That wallet is no longer available. Choose a detected wallet and try again.");
  }
  const wallet = getWallet();
  if (!wallet) throw new Error(missingSolanaWalletMessage());
  const { publicKey } = await wallet.connect();
  return publicKey.toBase58();
}

export async function signSolanaMessage(message: string): Promise<{
  walletAddress: string;
  signature: string;
}> {
  await requireAuthenticatedWalletUser();
  const wallet = getWallet();
  if (!wallet) throw new Error(missingSolanaWalletMessage());
  const { publicKey } = await wallet.connect();
  if (!wallet.signMessage)
    throw new Error("Your selected wallet cannot sign messages. Choose another Solana wallet.");
  const signature = await wallet.signMessage(new TextEncoder().encode(message));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return { walletAddress: publicKey.toBase58(), signature: btoa(binary) };
}

export async function attestReport(params: {
  reportId: string;
  category: string;
  neighborhood: string | null;
}): Promise<{ signature: string; wallet: string }> {
  await requireAuthenticatedWalletUser();
  const { Connection, PublicKey, Transaction, TransactionInstruction } = await loadSolanaSdk();
  const wallet = getWallet();
  if (!wallet) throw new Error(missingSolanaWalletMessage());
  const { publicKey } = await wallet.connect();

  const memoProgramId = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  const memo = JSON.stringify({
    app: "atlas",
    report: params.reportId,
    category: params.category,
    neighborhood: params.neighborhood ?? "houston",
    ts: Date.now(),
  });

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      keys: [],
      programId: memoProgramId,
      data: new TextEncoder().encode(memo) as unknown as import("buffer").Buffer,
    }),
  );

  const { signature } = await wallet.signAndSendTransaction(tx);
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  return { signature, wallet: publicKey.toBase58() };
}

export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
