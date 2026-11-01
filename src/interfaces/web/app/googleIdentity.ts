// The browser half of Google sign-in. Google's identity script is loaded only
// when the user chooses to connect, never on page load, and the access token it
// returns is held in memory for one call and never stored.

interface TokenResponse {
  readonly access_token?: string;
  readonly error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { readonly prompt?: string }): void;
}

interface GoogleIdentity {
  readonly accounts: {
    readonly oauth2: {
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

export type SignInResult =
  | { readonly ok: true; readonly accessToken: string }
  | { readonly ok: false; readonly reason: "denied" | "closed" | "unavailable" };

const IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const LOAD_TIMEOUT_MILLISECONDS = 15_000;

let loading: Promise<boolean> | null = null;

function loadIdentityScript(): Promise<boolean> {
  if (window.google !== undefined) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      resolve(false);
    }, LOAD_TIMEOUT_MILLISECONDS);
    script.src = IDENTITY_SCRIPT;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      resolve(window.google !== undefined);
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    document.head.append(script);
  });
  return loading.then((loaded) => {
    if (!loaded) loading = null;
    return loaded;
  });
}

/** Asks the signed-in user for a short-lived token with the given scope. */
export async function signIn(clientId: string, scope: string): Promise<SignInResult> {
  if (!(await loadIdentityScript()) || window.google === undefined) return { ok: false, reason: "unavailable" };
  const identity = window.google;
  return new Promise<SignInResult>((resolve) => {
    const client = identity.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response) => {
        if (response.access_token !== undefined && response.error === undefined) {
          resolve({ ok: true, accessToken: response.access_token });
        } else {
          resolve({ ok: false, reason: response.error === "access_denied" ? "denied" : "unavailable" });
        }
      },
      error_callback: (error) => {
        resolve({ ok: false, reason: error.type === "popup_closed" ? "closed" : "unavailable" });
      },
    });
    client.requestAccessToken();
  });
}
