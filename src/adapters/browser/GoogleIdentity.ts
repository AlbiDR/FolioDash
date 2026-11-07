import type { SignInOptions, SignInResult } from "../../applications/SessionModel";
// The browser half of Google sign-in. Google's identity script is loaded only once a
// connection exists or the person chooses to connect, never for the signed-out demo.
// Its pop-up needs a user gesture, so the token client is prepared ahead of time and
// asked synchronously from inside the click, with no network wait in between.

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number | string;
  readonly scope?: string;
  readonly error?: string;
}

interface TokenRequestOptions {
  readonly prompt?: string;
  /** Google's documented name for the remembered account in the token client. */
  readonly hint?: string;
  /** The OAuth parameter behind it. Sent as well, because a client ignores a name it does not know. */
  readonly login_hint?: string;
}

interface TokenClient {
  requestAccessToken(options?: TokenRequestOptions): void;
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

/** One token client per client ID and scope, reused so asking again costs no setup. */
interface PreparedClient {
  readonly clientId: string;
  readonly scope: string;
  readonly client: TokenClient;
  /** Receives the answer to the request in flight, if any. */
  settle: ((result: SignInResult) => void) | null;
}

let prepared: PreparedClient | null = null;
let inFlight: Promise<SignInResult> | null = null;

function interpret(response: TokenResponse, scope: string): SignInResult {
  if (response.access_token && response.error === undefined) {
    const granted = new Set((response.scope ?? "").split(/\s+/u));
    if (!scope.split(/\s+/u).every((item) => granted.has(item))) return { ok: false, reason: "denied" };
    const lifetime = Number(response.expires_in);
    return { ok: true, accessToken: response.access_token, ...(Number.isFinite(lifetime) && lifetime > 0 ? { expiresInSeconds: lifetime } : {}) };
  }
  return { ok: false, reason: response.error === "access_denied" ? "denied" : "unavailable" };
}

function clientFor(identity: GoogleIdentity, clientId: string, scope: string): PreparedClient {
  if (prepared !== null && prepared.clientId === clientId && prepared.scope === scope) return prepared;
  const holder: { current: PreparedClient | null } = { current: null };
  const client = identity.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope,
    callback: (response) => { holder.current?.settle?.(interpret(response, scope)); },
    error_callback: (error) => {
      holder.current?.settle?.({ ok: false, reason: error.type === "popup_closed" ? "closed" : error.type === "popup_failed_to_open" ? "blocked" : "unavailable" });
    },
  });
  holder.current = { clientId, scope, client, settle: null };
  prepared = holder.current;
  return holder.current;
}

/** Starts the request in the current call stack, which is what keeps the person's click valid for Google's window. */
function request(identity: GoogleIdentity, clientId: string, scope: string, options: SignInOptions | undefined): Promise<SignInResult> {
  return new Promise<SignInResult>((resolve) => {
    let state: PreparedClient | null = null;
    const finish = (result: SignInResult): void => {
      window.clearTimeout(timer);
      if (state !== null && state.settle === finish) state.settle = null;
      resolve(result);
    };
    const timer = window.setTimeout(() => { finish({ ok: false, reason: "timeout" }); }, SIGN_IN_TIMEOUT_MILLISECONDS);
    try {
      state = clientFor(identity, clientId, scope);
      state.settle = finish;
      const hint = options?.loginHint;
      // "" lets Google reuse existing consent instead of forcing its default account picker.
      state.client.requestAccessToken({ prompt: options?.prompt ?? "", ...(hint === undefined ? {} : { hint, login_hint: hint }) });
    } catch {
      finish({ ok: false, reason: "unavailable" });
    }
  });
}

/**
 * Loads Google's script and builds the token client so the first request can start
 * synchronously inside a click. Safe to call repeatedly; failures are retried by the next sign-in.
 */
export function prepareGoogleIdentity(clientId: string, scope: string): void {
  void loadIdentityScript().then((loaded) => {
    if (!loaded || window.google === undefined) return;
    try {
      clientFor(window.google, clientId, scope);
    } catch {
      // The sign-in itself reports a client that cannot start.
    }
  });
}

/** Asks Google for a short-lived token with the given scope. Concurrent requests share one window. */
export function signIn(clientId: string, scope: string, options?: SignInOptions): Promise<SignInResult> {
  if (inFlight !== null) return inFlight;
  const identity = window.google;
  const work = identity === undefined
    ? loadIdentityScript().then((loaded): Promise<SignInResult> | SignInResult => (loaded && window.google !== undefined ? request(window.google, clientId, scope, options) : { ok: false, reason: "unavailable" }))
    : request(identity, clientId, scope, options);
  inFlight = work;
  void work.finally(() => { if (inFlight === work) inFlight = null; });
  return work;
}

/** Asks Google to cancel a token. Best effort: it never blocks or fails the caller. */
export function revokeToken(accessToken: string): void {
  try {
    window.google?.accounts.oauth2.revoke(accessToken);
  } catch {
    // The token expires on its own within the hour.
  }
}
