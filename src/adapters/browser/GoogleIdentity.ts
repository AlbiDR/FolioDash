import type { SignInOptions, SignInResult } from "../../applications/SessionModel";
// The browser half of Google sign-in. Google's identity script is loaded only
// when the user chooses to connect, never on page load, and the access token it
// returns can be reused until expiry by the tab-scoped session.

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number | string;
  readonly scope?: string;
  readonly error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { readonly prompt?: string }): void;
}

interface GoogleIdentity {
  readonly accounts: {
    readonly oauth2: {
      revoke(accessToken: string, done?: () => void): void;
      initTokenClient(config: {
        readonly client_id: string;
        readonly scope: string;
        readonly callback: (response: TokenResponse) => void;
        readonly error_callback?: (error: { readonly type: string }) => void;
      }): TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const LOAD_TIMEOUT_MILLISECONDS = 15_000;
const SIGN_IN_TIMEOUT_MILLISECONDS = 120_000;

let loading: Promise<boolean> | null = null;

function loadIdentityScript(): Promise<boolean> {
  if (window.google !== undefined) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    const finish = (loaded: boolean): void => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (!loaded) script.remove();
      resolve(loaded);
    };
    const timer = window.setTimeout(() => { finish(false); }, LOAD_TIMEOUT_MILLISECONDS);
    script.src = IDENTITY_SCRIPT;
    script.async = true;
    script.onload = () => {
      finish(window.google !== undefined);
    };
    script.onerror = () => {
      finish(false);
    };
    document.head.append(script);
  });
  return loading.then((loaded) => {
    if (!loaded) loading = null;
    return loaded;
  });
}

/** Asks the signed-in user for a short-lived token with the given scope. */
export async function signIn(clientId: string, scope: string, options?: SignInOptions): Promise<SignInResult> {
  if (!(await loadIdentityScript()) || window.google === undefined) return { ok: false, reason: "unavailable" };
  const identity = window.google;
  return new Promise<SignInResult>((resolve) => {
    let settled = false;
    const finish = (result: SignInResult): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => { finish({ ok: false, reason: "timeout" }); }, SIGN_IN_TIMEOUT_MILLISECONDS);
    try {
      const client = identity.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope,
        callback: (response) => {
          if (response.access_token && response.error === undefined) {
            const granted = new Set((response.scope ?? "").split(/\s+/u));
            if (!scope.split(/\s+/u).every((item) => granted.has(item))) {
              finish({ ok: false, reason: "denied" });
              return;
            }
            const lifetime = Number(response.expires_in);
            finish({ ok: true, accessToken: response.access_token, ...(Number.isFinite(lifetime) && lifetime > 0 ? { expiresInSeconds: lifetime } : {}) });
          } else {
            finish({ ok: false, reason: response.error === "access_denied" ? "denied" : "unavailable" });
          }
        },
        error_callback: (error) => {
          finish({ ok: false, reason: error.type === "popup_closed" ? "closed" : error.type === "popup_failed_to_open" ? "blocked" : "unavailable" });
        },
      });
      // Let Google reuse existing consent instead of forcing its default account picker.
      client.requestAccessToken({ prompt: options?.selectAccount === true ? "select_account" : "" });
    } catch {
      finish({ ok: false, reason: "unavailable" });
    }
  });
}

/** Asks Google to cancel a token. Best effort: it never blocks or fails the caller. */
export function revokeToken(accessToken: string): void {
  try {
    window.google?.accounts.oauth2.revoke(accessToken);
  } catch {
    // The token expires on its own within the hour.
  }
}
