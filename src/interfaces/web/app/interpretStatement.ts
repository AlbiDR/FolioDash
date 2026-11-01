import { interpretFideuramSheet } from "../../../adapters/fideuram/FideuramLayout";
import type { InterpretStatement } from "../../../applications/Rebuild";

/** Today's bank-file reader, offered to the layers that must re-read a stored statement. */
export const interpretStatement: InterpretStatement = (sheet) => {
  const result = interpretFideuramSheet(sheet);
  if (!result.ok) return { ok: false, message: result.issues[0]?.message ?? "The statement could not be read." };
  return {
    ok: true,
    statement: {
      funds: result.statement.funds.map((fund) => ({ isin: fund.isin, name: fund.name, marketValue: fund.marketValue })),
      fundsSubtotal: result.statement.fundsSubtotal,
    },
  };
};
