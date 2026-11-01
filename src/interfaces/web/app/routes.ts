import { parseIsin } from "../../../core/Isin";

export type Route =
  | { readonly name: "overview" }
  | { readonly name: "months" }
  | { readonly name: "fund"; readonly isin: string }
  | { readonly name: "import" }
  | { readonly name: "history" }
  | { readonly name: "connection" };

/** Reads the address fragment. Anything unknown, including a malformed fund identifier, is the overview. */
export function routeFrom(hash: string): Route {
  if (hash === "#import") return { name: "import" };
  if (hash === "#history") return { name: "history" };
  if (hash === "#connection") return { name: "connection" };
  if (hash === "#months") return { name: "months" };
  if (hash.startsWith("#fund/")) {
    const isin = parseIsin(hash.slice("#fund/".length));
    if (isin !== null) return { name: "fund", isin };
  }
  return { name: "overview" };
}

/** Which main navigation entry a route belongs to: the detail screens belong to the portfolio. */
export function navEntryOf(route: Route): "overview" | "import" | "history" | "connection" {
  return route.name === "months" || route.name === "fund" ? "overview" : route.name;
}
