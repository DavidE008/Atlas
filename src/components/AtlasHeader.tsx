import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function AtlasHeader() {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (live) setSignedIn(!!data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => {
      live = false;
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
