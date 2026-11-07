import { type RestClient, callRest } from "./Rest";

const ABOUT = "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)";

/**
 * The email address of the signed-in Google account, used only as a sign-in hint so Google
 * skips its account chooser next time. Drive's about.get is available under drive.file.
 * Best effort: the address may be absent, and a failure just means the chooser may show.
 */
export async function fetchAccountHint(rest: RestClient, accessToken: string): Promise<string | null> {
  const result = await callRest(rest, accessToken, { method: "GET", url: ABOUT });
  if (!result.ok) return null;
  const user = (result.value as { user?: { emailAddress?: unknown } } | null)?.user;
  const address = user?.emailAddress;
  return typeof address === "string" && address.length > 0 && address.length <= 254 && address.includes("@") ? address : null;
}
