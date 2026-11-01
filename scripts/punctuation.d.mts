export interface Dash {
  readonly line: number;
  readonly column: number;
  readonly name: string;
}
export const FORBIDDEN: readonly { readonly character: string; readonly name: string }[];
export function findDashes(text: string): Dash[];
