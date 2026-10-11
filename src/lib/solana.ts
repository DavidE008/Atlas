// Light Solana integration: Phantom wallet + devnet memo attestation.
// Browser-only module — never import from server code.

import type { PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer/";
import solanaScriptUrl from "@solana/web3.js/lib/index.iife.min.js?url";

const DEVNET_RPC = "https://api.devnet.solana.com";
let sdkPromise: Promise<typeof import("@solana/web3.js")> | undefined;

function loadSolanaSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<typeof import("@solana/web3.js")>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = solanaScriptUrl;
    script.async = true;
    script.onload = () => {
      const sdk = (window as unknown as { solanaWeb3?: typeof import("@solana/web3.js") }).solanaWeb3;
      if (sdk) resolve(sdk);
      else reject(new Error("Solana wallet tools could not initialize."));
    };
    script.onerror = () => reject(new Error("Solana wallet tools could not load."));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (
    tx: Transaction,
  ) => Promise<{ signature: string }>;
};

function getPhantom(): PhantomProvider | null {
  const w = window as unknown as { solana?: PhantomProvider };
  return w.solana?.isPhantom ? w.solana : null;
}

export function isPhantomInstalled(): boolean {
  return getPhantom() != null;
}

export async function connectWallet(): Promise<string> {
  const phantom = getPhantom();
  if (!phantom) {
    throw new Error(
      "Phantom wallet not found. Install Phantom to record on-chain proofs.",
    );
  }
  const { publicKey } = await phantom.connect();
  return publicKey.toBase58();
}

export async function attestReport(params: {
  reportId: string;
  category: string;
  neighborhood: string | null;
}): Promise<{ signature: string; wallet: string }> {
  const phantom = getPhantom();
  if (!phantom) {
    throw new Error("Phantom wallet not found.");
  }
  const { publicKey } = await phantom.connect();

  const { Connection, PublicKey, Transaction, TransactionInstruction } = await loadSolanaSdk();
  const memoProgramId = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
  const memo = JSON.stringify({
    app: "atlas",
    report: params.reportId,
    category: params.category,
    neighborhood: params.neighborhood ?? "houston",
    ts: Date.now(),
  });

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    new TransactionInstruction({
      keys: [],
      programId: memoProgramId,
      data: Buffer.from(memo, "utf-8") as unknown as import("buffer").Buffer,
    }),
  );

  const { signature } = await phantom.signAndSendTransaction(tx);
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return { signature, wallet: publicKey.toBase58() };
}

export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
