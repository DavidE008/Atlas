import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  KeyRound,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  UserRound,
  Wallet,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { connectWallet } from "@/lib/solana";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import {
  getSelectedSolanaWalletProviderId,
  listSolanaWalletProviders,
  selectSolanaWalletProvider,
  subscribeToSolanaWalletProviders,
  type SolanaWalletChoice,
} from "@/lib/solana-wallet-provider";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Account settings · Atlas" },
      { name: "description", content: "Manage your Atlas profile, sign-in details, and wallet." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState("");
  const [walletProviders, setWalletProviders] = useState<SolanaWalletChoice[]>([]);
  const [selectedWalletProvider, setSelectedWalletProvider] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!live) return;
      const currentUser = auth.user;
      setUser(currentUser);
      if (currentUser) {
        setEmail(currentUser.email ?? "");
        const [profileResult, settingsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", currentUser.id)
            .maybeSingle(),
          supabase
            .from("account_settings")
            .select("wallet_address")
            .eq("user_id", currentUser.id)
            .maybeSingle(),
        ]);
        if (!live) return;
        if (profileResult.data) setDisplayName(profileResult.data.display_name ?? "");
        if (profileResult.data) setAvatarPath(profileResult.data.avatar_url);
        if (settingsResult.data) setWalletAddress(settingsResult.data.wallet_address);
        if (profileResult.error) setError(profileResult.error.message);
        if (settingsResult.error) setError(settingsResult.error.message);
      } else {
        if (live) void navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
      }
      if (live) setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [navigate]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      setUser(null);
      setDisplayName("");
      setAvatarPath(null);
      setEmail("");
      setWalletAddress(null);
      setConnectedWallet("");
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refreshProviders = () => {
      const providers = listSolanaWalletProviders();
      setWalletProviders(providers);
      const storedProvider = getSelectedSolanaWalletProviderId();
      setSelectedWalletProvider(
        providers.some(({ id }) => id === storedProvider)
          ? storedProvider!
          : (providers[0]?.id ?? ""),
      );
    };
    refreshProviders();
    return subscribeToSolanaWalletProviders(refreshProviders);
  }, []);

  function clearFeedback() {
    setError("");
    setNotice("");
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    clearFeedback();
    setBusy("name");
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", user.id);
    if (updateError) setError(updateError.message);
    else {
      setNotice("Your name has been updated.");
      window.dispatchEvent(new Event("atlas-profile-updated"));
    }
    setBusy("");
  }

  async function setProfilePhoto(file: File | null) {
    if (!user) return;
    clearFeedback();
    setBusy("avatar");
    let newPath: string | null = null;
    try {
      if (file) {
        const extensionByType: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };
        const extension = extensionByType[file.type];
        if (!extension) throw new Error("Choose a JPG, PNG, or WebP image.");
        if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image under 5 MB.");

        newPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("profile-avatars")
          .upload(newPath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: newPath })
        .eq("id", user.id);
      if (updateError) throw updateError;

      const oldPath = avatarPath;
      setAvatarPath(newPath);
      setNotice(
        file ? "Your profile photo has been updated." : "Your default Atlas photo is now active.",
      );
      window.dispatchEvent(new Event("atlas-profile-updated"));
      if (oldPath && oldPath !== newPath) {
        const { error: removeError } = await supabase.storage
          .from("profile-avatars")
          .remove([oldPath]);
        if (removeError) console.warn("Old profile photo could not be removed.", removeError);
      }
    } catch (issue) {
      if (newPath) await supabase.storage.from("profile-avatars").remove([newPath]);
      setError(issue instanceof Error ? issue.message : "We couldn't update your profile photo.");
    } finally {
      setBusy("");
      if (libraryInputRef.current) libraryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  function onPhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    if (file) void setProfilePhoto(file);
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    setBusy("email");
    const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
    if (updateError) setError(updateError.message);
    else
      setNotice(
        "Check your inbox to confirm the email change. Your current email stays active until confirmation.",
      );
    setBusy("");
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    clearFeedback();
    if (newPassword.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords don't match.");
      return;
    }
    setBusy("password");
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) setError(updateError.message);
    else {
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Your password has been changed.");
    }
    setBusy("");
  }

  async function connectCurrentWallet() {
    clearFeedback();
    setBusy("connect");
    try {
      setConnectedWallet(await connectWallet(selectedWalletProvider || undefined));
      setNotice("Wallet connected. Save it below to use it for future Atlas missions.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "We couldn't connect that wallet.");
    }
    setBusy("");
  }

  async function saveWallet() {
    if (!user || !connectedWallet) return;
    clearFeedback();
    setBusy("wallet");
    const { error: updateError } = await supabase
      .from("account_settings")
      .upsert(
        { user_id: user.id, wallet_address: connectedWallet, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (updateError) setError(updateError.message);
    else {
      setWalletAddress(connectedWallet);
      setConnectedWallet("");
      setNotice(
        "Your wallet is linked for future missions. Existing mission records keep their original wallet.",
      );
    }
    setBusy("");
  }

  if (loading) {
    return (
      <div className="settings-loading" aria-label="Loading account settings">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <section className="settings-page">
      <div className="settings-heading">
        <span className="eyebrow">Your Atlas account</span>
        <h1>Settings that move with you.</h1>
        <p>Keep your profile and mission details up to date.</p>
        <div className="settings-account-email">
          <Mail size={16} /> {user.email}
        </div>
      </div>

      {(notice || error) && (
        <div
          className={error ? "settings-feedback is-error" : "settings-feedback"}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      )}

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-title">
            <span className="settings-icon">
              <UserRound size={18} />
            </span>
            <div>
              <h2>Profile</h2>
              <p>Your name appears with your Atlas activity.</p>
            </div>
          </div>
          <div className="profile-photo-editor">
            <ProfileAvatar
              path={avatarPath}
              name={displayName || user.email || "Atlas account"}
              className="profile-avatar-large"
            />
            <div className="profile-photo-controls">
              <p>Your photo appears with your Atlas account and activity.</p>
              <input
                ref={libraryInputRef}
                className="profile-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onPhotoSelected}
                aria-label="Choose a profile photo from your library"
              />
              <input
                ref={cameraInputRef}
                className="profile-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                onChange={onPhotoSelected}
                aria-label="Take a profile photo"
              />
              <div className="profile-photo-actions">
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  disabled={busy === "avatar"}
                >
                  {busy === "avatar" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ImagePlus size={16} />
                  )}
                  Choose from library
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy === "avatar"}
                >
                  <Camera size={16} /> Take a photo
                </button>
                <button
                  className="profile-photo-default"
                  type="button"
                  onClick={() => void setProfilePhoto(null)}
                  disabled={busy === "avatar" || !avatarPath}
                >
                  <RotateCcw size={15} /> Use default
                </button>
              </div>
              <span className="settings-note">JPG, PNG, or WebP · Up to 5 MB</span>
            </div>
          </div>
          <form className="atlas-form" onSubmit={saveName}>
            <label htmlFor="settings-name">
              Display name
              <input
                id="settings-name"
                value={displayName}
                maxLength={80}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <button
              className="button-primary settings-submit"
              type="submit"
              disabled={busy === "name"}
            >
              {busy === "name" ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <>
                  <Save size={16} /> Save name
                </>
              )}
            </button>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <span className="settings-icon">
              <Mail size={18} />
            </span>
            <div>
              <h2>Email address</h2>
              <p>We’ll ask you to confirm the new address.</p>
            </div>
          </div>
          <form className="atlas-form" onSubmit={saveEmail}>
            <label htmlFor="settings-email">
              New email
              <input
                id="settings-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <button
              className="button-primary settings-submit"
              type="submit"
              disabled={
                busy === "email" || email.trim().toLowerCase() === user.email?.toLowerCase()
              }
            >
              {busy === "email" ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <>
                  <Mail size={16} /> Update email
                </>
              )}
            </button>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <span className="settings-icon">
              <KeyRound size={18} />
            </span>
            <div>
              <h2>Password</h2>
              <p>Choose a new password for your Atlas sign-in.</p>
            </div>
          </div>
          <form className="atlas-form" onSubmit={savePassword}>
            <label htmlFor="settings-password">
              New password
              <input
                id="settings-password"
                type="password"
                value={newPassword}
                minLength={8}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </label>
            <label htmlFor="settings-password-confirm">
              Confirm new password
              <input
                id="settings-password-confirm"
                type="password"
                value={confirmPassword}
                minLength={8}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Enter it again"
              />
            </label>
            <button
              className="button-primary settings-submit"
              type="submit"
              disabled={busy === "password"}
            >
              {busy === "password" ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <>
                  <KeyRound size={16} /> Change password
                </>
              )}
            </button>
          </form>
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <span className="settings-icon">
              <Wallet size={18} />
            </span>
            <div>
              <h2>Mission wallet</h2>
              <p>Linked wallets are private to your account and used for future missions.</p>
            </div>
          </div>
          <div className="wallet-current">
            <span>Currently linked</span>
            <strong>
              {walletAddress
                ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
                : "No wallet linked"}
            </strong>
          </div>
          {connectedWallet && (
            <div className="wallet-connected">
              <Check size={16} />
              <span>{connectedWallet}</span>
            </div>
          )}
          {walletProviders.length > 1 ? (
            <label className="settings-wallet-provider">
              <span>Choose a wallet provider</span>
              <select
                value={selectedWalletProvider}
                onChange={(event) => {
                  const providerId = event.currentTarget.value;
                  if (selectSolanaWalletProvider(providerId)) setSelectedWalletProvider(providerId);
                }}
              >
                {walletProviders.map((provider) => (
                  <option value={provider.id} key={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
          ) : walletProviders[0] ? (
            <p className="settings-note">Detected wallet: {walletProviders[0].name}</p>
          ) : (
            <p className="settings-note">No wallet provider detected in this browser.</p>
          )}
          <div className="wallet-actions">
            <button
              className="button-secondary"
              type="button"
              onClick={() => void connectCurrentWallet()}
              disabled={busy === "connect" || busy === "wallet"}
            >
              {busy === "connect" ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Wallet size={16} />
              )}{" "}
              Connect wallet
            </button>
            {connectedWallet && (
              <button
                className="button-primary settings-submit"
                type="button"
                onClick={() => void saveWallet()}
                disabled={busy === "wallet"}
              >
                {busy === "wallet" ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <>
                    <Save size={16} /> Save wallet
                  </>
                )}
              </button>
            )}
          </div>
          <p className="settings-note">
            Choose a provider above when you have multiple wallets installed. The selected wallet
            will sign future mission actions. Past missions keep their original on-chain wallet.
          </p>
        </section>
      </div>
    </section>
  );
}
