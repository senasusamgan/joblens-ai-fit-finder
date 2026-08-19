import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function AuthControl() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

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
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    setBusy(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });

    if (error) {
      console.error("[JobLens Auth] Google sign-in failed:", error.message);
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
  };

  if (!ready) {
    return <div className="h-8 w-16" aria-hidden />;
  }

  if (!session) {
    return (
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
      >
        <LogIn className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Sign in</span>
      </button>
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
