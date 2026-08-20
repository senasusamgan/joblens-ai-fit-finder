import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clearGoogleProviderToken } from "@/lib/gmail";
import { renderGoogleSignInButton } from "@/lib/google-identity";

export function AuthControl() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;

      setSession(data.session);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
      setBusy(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || session || !googleButtonRef.current) {
      return;
    }

    setAuthError(null);

    void renderGoogleSignInButton(
      googleButtonRef.current,
      async () => {
        setBusy(false);
      },
      (error) => {
        console.error(
          "[JobLens Auth] Google sign-in failed:",
          error.message,
        );
        setAuthError("Google sign-in failed. Please try again.");
        setBusy(false);
      },
    );
  }, [ready, session]);

  const signOut = async () => {
    setBusy(true);
    clearGoogleProviderToken();
    await supabase.auth.signOut();
    setBusy(false);
  };

  if (!ready) {
    return <div className="h-8 w-20" aria-hidden />;
  }

  if (!session) {
    return (
      <div className="ml-1 flex flex-col items-end">
        <div
          ref={googleButtonRef}
          className={busy ? "pointer-events-none opacity-60" : ""}
        />

        {authError && (
          <span className="mt-1 max-w-48 text-right text-[10px] text-red-400">
            {authError}
          </span>
        )}
      </div>
    );
  }

  const user = session.user;

  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : user.email ?? "Account";

  return (
    <div className="ml-1 flex items-center gap-2">
      <div
        className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
        style={{ background: "var(--gradient-hero)" }}
        title={displayName}
      >
        {displayName.slice(0, 1).toUpperCase()}
      </div>

      <span className="hidden max-w-32 truncate text-xs text-white/65 lg:inline">
        {displayName}
      </span>

      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
