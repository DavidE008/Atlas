import type { PublicKey, Transaction } from "@solana/web3.js";
import solanaScriptUrl from "@solana/web3.js/lib/index.iife.min.js?url";
import { SolanaSignAndSendTransaction, SolanaSignMessage } from "@solana/wallet-standard-features";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";

const SELECTED_WALLET_KEY = "atlas.selected-solana-wallet";
const DEVNET_CHAIN = "solana:devnet";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
let solanaSdkPromise: Promise<typeof import("@solana/web3.js")> | undefined;

function loadSolanaSdk() {
  if (solanaSdkPromise) return solanaSdkPromise;
  const currentSdk = (window as Window & { solanaWeb3?: typeof import("@solana/web3.js") })
    .solanaWeb3;
  if (currentSdk) return Promise.resolve(currentSdk);

  solanaSdkPromise = new Promise<typeof import("@solana/web3.js")>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = solanaScriptUrl;
    script.async = true;
    script.onload = () => {
      const sdk = (window as Window & { solanaWeb3?: typeof import("@solana/web3.js") }).solanaWeb3;
      if (sdk) resolve(sdk);
      else reject(new Error("Solana wallet tools could not initialize."));
    };
    script.onerror = () => reject(new Error("Solana wallet tools could not load."));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    solanaSdkPromise = undefined;
    throw error;
  });
  return solanaSdkPromise;
}

export type SolanaWalletProvider = {
  isBraveWallet?: boolean;
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect?: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string }>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

export type SolanaWalletChoice = {
  id: string;
  name: string;
};

type StandardSolanaWallet = Wallet & {
  features: Wallet["features"] & {
    "standard:connect": {
      connect: () => Promise<{ accounts: readonly WalletAccount[] }>;
    };
    "standard:disconnect"?: { disconnect: () => Promise<void> };
    [SolanaSignAndSendTransaction]: {
      signAndSendTransaction: (
        ...inputs: readonly {
          account: WalletAccount;
          transaction: Uint8Array;
          chain: string;
          options?: { commitment?: "processed" | "confirmed" | "finalized" };
        }[]
      ) => Promise<readonly { signature: Uint8Array }[]>;
    };
    [SolanaSignMessage]?: {
      signMessage: (
        ...inputs: readonly { account: WalletAccount; message: Uint8Array }[]
      ) => Promise<readonly { signature: Uint8Array; signedMessage: Uint8Array }[]>;
    };
  };
};

type ProviderEntry = SolanaWalletChoice & { provider: SolanaWalletProvider };
type InjectedSolanaWalletProvider = Omit<SolanaWalletProvider, "signMessage"> & {
  signMessage?: (
    message: Uint8Array,
    displayEncoding?: "utf8" | "hex",
  ) => Promise<Uint8Array | { signature: Uint8Array }>;
};
const standardProviderCache = new WeakMap<Wallet, SolanaWalletProvider>();

function injectedWalletProvider(provider: InjectedSolanaWalletProvider): SolanaWalletProvider {
  if (!provider.signMessage) return provider as unknown as SolanaWalletProvider;
  return {
    ...provider,
    async signMessage(message) {
      if (!provider.signMessage) throw new Error("This wallet does not support message signing.");
      const result = await provider.signMessage(message, "utf8");
      return result instanceof Uint8Array ? result : result.signature;
    },
  };
}

function encodeBase58(bytes: Uint8Array) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = BASE58_ALPHABET[remainder] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

function standardWalletProvider(wallet: StandardSolanaWallet): SolanaWalletProvider {
  let account: WalletAccount | null = null;

  return {
    async connect() {
      const { accounts } = await wallet.features["standard:connect"].connect();
      account = accounts.find((candidate) => candidate.chains.includes(DEVNET_CHAIN)) ?? null;
      if (!account) {
        throw new Error(`${wallet.name} has no connected account available on Solana Devnet.`);
      }
      const sdk = await loadSolanaSdk();
      return { publicKey: new sdk.PublicKey(account.address) };
    },
    async disconnect() {
      account = null;
      await wallet.features["standard:disconnect"]?.disconnect();
    },
    async signAndSendTransaction(transaction) {
      if (!account) await this.connect();
      if (!account) throw new Error(`Connect ${wallet.name} before signing a transaction.`);
      const [result] = await wallet.features[SolanaSignAndSendTransaction].signAndSendTransaction({
        account,
        transaction: transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
        chain: DEVNET_CHAIN,
        options: { commitment: "confirmed" },
      });
      if (!result) throw new Error(`${wallet.name} did not return a transaction signature.`);
      return { signature: encodeBase58(result.signature) };
    },
    async signMessage(message) {
      const feature = wallet.features[SolanaSignMessage];
      if (!feature) throw new Error(`${wallet.name} does not support signing messages.`);
      if (!account) await this.connect();
      if (!account) throw new Error(`Connect ${wallet.name} before signing a message.`);
      const [result] = await feature.signMessage({ account, message });
      if (!result) throw new Error(`${wallet.name} did not return a message signature.`);
      if (
        result.signedMessage.length !== message.length ||
        result.signedMessage.some((byte, index) => byte !== message[index])
      )
        throw new Error(`${wallet.name} changed the message before signing it.`);
      return result.signature;
    },
  };
}

function isSupportedStandardWallet(wallet: Wallet): wallet is StandardSolanaWallet {
  const features = wallet.features;
  return (
    wallet.chains.includes(DEVNET_CHAIN) &&
    "standard:connect" in features &&
    SolanaSignAndSendTransaction in features
  );
}

function isSupportedInjectedProvider(
  provider: InjectedSolanaWalletProvider | undefined,
): provider is InjectedSolanaWalletProvider {
  return Boolean(provider && (provider.isBraveWallet || provider.isPhantom));
}

function getProviderEntries(): ProviderEntry[] {
  if (typeof window === "undefined") return [];

  const entries: ProviderEntry[] = [];
  const names = new Set<string>();

  for (const wallet of getWallets().get()) {
    if (!isSupportedStandardWallet(wallet)) continue;
    const normalizedName = wallet.name.toLowerCase();
    if (names.has(normalizedName)) continue;
    names.add(normalizedName);
    let provider = standardProviderCache.get(wallet);
    if (!provider) {
      provider = standardWalletProvider(wallet);
      standardProviderCache.set(wallet, provider);
    }
    entries.push({
      id: `standard:${wallet.name}`,
      name: wallet.name,
      provider,
    });
  }

  const walletWindow = window as Window & {
    braveSolana?: InjectedSolanaWalletProvider;
    solana?: InjectedSolanaWalletProvider;
  };
  const injectedProviders = [walletWindow.solana, walletWindow.braveSolana];
  for (const provider of injectedProviders) {
    if (!isSupportedInjectedProvider(provider)) continue;
    const name = provider.isBraveWallet ? "Brave Wallet" : "Phantom";
    if (names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    entries.push({
      id: `injected:${name.toLowerCase().replaceAll(" ", "-")}`,
      name,
      provider: injectedWalletProvider(provider),
    });
  }

  return entries;
}

export function listSolanaWalletProviders(): SolanaWalletChoice[] {
  return getProviderEntries().map(({ id, name }) => ({ id, name }));
}

export function getSelectedSolanaWalletProviderId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SELECTED_WALLET_KEY);
  } catch {
    return null;
  }
}

export function selectSolanaWalletProvider(id: string): boolean {
  const provider = getProviderEntries().find((entry) => entry.id === id);
  if (!provider || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SELECTED_WALLET_KEY, id);
  } catch {
    // Continue with this session's choice when browser storage is unavailable.
  }
  return true;
}

export function subscribeToSolanaWalletProviders(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const wallets = getWallets();
  const offRegister = wallets.on("register", onChange);
  const offUnregister = wallets.on("unregister", onChange);
  return () => {
    offRegister();
    offUnregister();
  };
}

export function getSolanaWalletProvider(): SolanaWalletProvider | null {
  const entries = getProviderEntries();
  if (entries.length === 0) return null;

  const selectedId = getSelectedSolanaWalletProviderId();
  return entries.find(({ id }) => id === selectedId)?.provider ?? entries[0]!.provider;
}

export function missingSolanaWalletMessage() {
  return "No Solana wallet was detected. Install a wallet such as Phantom, Solflare, Backpack, or Brave Wallet, then reload Atlas.";
}
