import { supabase } from "@/integrations/supabase/client";

const GOOGLE_CLIENT_ID =
  "391461982264-3kni34dv067b1l3ku172fr1s9d71n6o1.apps.googleusercontent.com";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "small" | "medium" | "large";
      text?: "signin_with" | "signup_with" | "continue_with";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleIdentityApi;
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Google Identity Services requires a browser."),
    );
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = () => {
      googleScriptPromise = null;
      reject(
        new Error("Could not load Google Identity Services."),
      );
    };

    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

export async function renderGoogleSignInButton(
  container: HTMLElement,
  onSuccess: () => void | Promise<void>,
  onError: (error: Error) => void,
): Promise<void> {
  await loadGoogleIdentityServices();

  const google = window.google;

  if (!google?.accounts?.id) {
    throw new Error("Google Identity Services is unavailable.");
  }

  container.replaceChildren();

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    ux_mode: "popup",
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
    callback: async (response) => {
      try {
        if (!response.credential) {
          throw new Error("Google did not return an ID token.");
        }

        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
        });

        if (error) throw error;

        await onSuccess();
      } catch (error) {
        onError(
          error instanceof Error
            ? error
            : new Error("Google sign-in failed."),
        );
      }
    },
  });

  const isCompactViewport = window.matchMedia(
    "(max-width: 767px)",
  ).matches;

  google.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: isCompactViewport ? "medium" : "large",
    text: "signin_with",
    shape: "pill",
    logo_alignment: "left",
    width: isCompactViewport ? 130 : 280,
  });
}
