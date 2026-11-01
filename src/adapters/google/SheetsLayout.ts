/** Where the app keeps things inside the person's spreadsheet. The names are part of the stored format. */
export const LEDGER_TAB = "_FolioDash ledger";
export const VIEW_TAB = "FolioDash";
export const WORKBOOK_TITLE = "FolioDash";
export const LEDGER_HEADER: readonly string[] = ["revision", "type", "payload", "checksum"];
export const LEDGER_COLUMNS = LEDGER_HEADER.length;

/** Tags the spreadsheet in Drive so it can be found again on any device without remembering its id. */
export const APP_PROPERTY_KEY = "foliodash";
export const APP_PROPERTY_VALUE = "ledger-v1";
