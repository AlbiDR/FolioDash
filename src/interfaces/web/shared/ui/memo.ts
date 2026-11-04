/**
 * Remembers the result of the last call and returns it again while every argument
 * is the same object. Derived figures are recomputed only when the thing they come
 * from changes, not when the screen merely redraws (a toggle, a hover, a resize).
 */
export function memoizeLast<Args extends readonly unknown[], Result>(compute: (...args: Args) => Result): (...args: Args) => Result {
  let last: { readonly args: Args; readonly result: Result } | null = null;
  return (...args: Args): Result => {
    if (last !== null && last.args.length === args.length && last.args.every((value, index) => Object.is(value, args[index]))) {
      return last.result;
    }
    const result = compute(...args);
    last = { args, result };
    return result;
  };
}
