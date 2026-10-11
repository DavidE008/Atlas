import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { ProfileAvatar } from "@/components/ProfileAvatar";

export function AtlasHeader() {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let authEventReceived = false;
    let profileRequest = 0;
    const refreshProfile = async (session: Session | null) => {
      const request = ++profileRequest;
      if (!session) {
        setAvatarPath(null);
        setDisplayName(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();
      if (live && request === profileRequest) {
        setAvatarPath(data?.avatar_url ?? null);
        setDisplayName(data?.display_name ?? session.user.email ?? null);
      }
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (live && !authEventReceived) {
        setSignedIn(!!data.session);
        void refreshProfile(data.session);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      setSignedIn(!!session);
      void refreshProfile(session);
    });
    const onProfileUpdated = () => {
      void supabase.auth.getSession().then(({ data: sessionData }) => {
        void refreshProfile(sessionData.session);
      });
    };
    window.addEventListener("atlas-profile-updated", onProfileUpdated);
    return () => {
      live = false;
      window.removeEventListener("atlas-profile-updated", onProfileUpdated);
      data.subscription.unsubscribe();
    };
  }, []);
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    else {
      setSignedIn(false);
      setOpen(false);
    }
  }
  return (
    <header className="site-header">
      <Link to="/" className="atlas-brand" aria-label="Atlas home" onClick={() => setOpen(false)}>
        <img src="/images/atlas-symbol.webp" width="48" height="48" alt="" />
        <span>Atlas</span>
      </Link>
      <button
        type="button"
        className="menu-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="atlas-nav"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      <nav
        id="atlas-nav"
        aria-label="Main navigation"
        className={"atlas-nav" + (open ? " is-open" : "")}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <div className="nav-pages">
          <Link to="/missions" onClick={() => setOpen(false)}>
            Explore missions
          </Link>
          <Link to="/about" onClick={() => setOpen(false)}>
            How it works
          </Link>
        </div>
        <div className="nav-account">
          {signedIn ? (
            <>
              <Link to="/settings" onClick={() => setOpen(false)}>
                <ProfileAvatar
                  path={avatarPath}
                  name={displayName}
                  className="profile-avatar-nav"
                />
                Settings
              </Link>
              <button type="button" onClick={() => void signOut()}>
                Sign out
              </button>
              <Link to="/missions" className="button-primary" onClick={() => setOpen(false)}>
                Open missions
              </Link>
            </>
          ) : (
            <>
              <Link to="/auth" search={{ mode: "signin" }} onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="button-primary"
                onClick={() => setOpen(false)}
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
