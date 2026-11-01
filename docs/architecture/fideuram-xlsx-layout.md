# Fideuram portfolio export: XLSX layout v1

Status: **Draft: one observed export plus proposed import rules. Not accepted, not implemented.**  
Created: 2026-11-01  
Scope: the file the owner downloads from the bank and later imports as is. This document records the layout facts and the rules the bank adapter would need to read that file exactly. It is not a parser design.

[CleanStack §6.2](cleanstack.md#62-file-safety-and-evidence) requires a named, versioned Fideuram layout and says unsupported input fails clearly rather than being guessed into a valid portfolio. This document is that layout. Rules about identity, money, dates and consent stay in CleanStack; this document only says how they meet the bank's cell formats.

## 1. Evidence and its limits

Labels used below: **Observed** was seen in a file. **Inferred** follows from observed values but the bank did not state it. **Proposed** is a recommendation, not a decision.

- **Primary sample:** one export downloaded by the owner on 2026-11-01, read in place from the owner's Downloads folder. It is not copied into this repository.
- **Comparison set:** 17 monthly sheets (2025-07 to 2026-11) in the owner's private workbook. The 2026-11-01 sheet is identical to the primary sample, value for value and type for type. 11 of the 17 have the same cell typing as the sample. The other 6 were retyped or reformatted after export and are not bank originals (see §8).
- **Never observed:** categories other than funds and one current account, several holders, more than one product under one contract, negative values, prices of 1,000 or more, and any of the placeholder tokens listed in §4. Any rule touching these is inferred or proposed, not observed.
- **Owner-confirmed on 2026-11-01:** the bank exports only the current state, with no date selector, so a statement is dated by the day the export is made. The bank does not name the file `YYYY-MM-DD.xlsx`: the owner renames it so the legacy Apps Script can read the date from the name. The bank's own file name, as reported by the owner, is `estrazione_prodotti_patrimonio.xlsx`, which contains no date. Funds come and go, and the layout must work for other people's portfolios, not only the owner's (§5 rule 12).
- **No synthetic fixtures, parser or test exists yet.** Nothing here has been verified against running code.

## 2. File-level facts

| Fact | Status | Detail |
|---|---|---|
| Producer | Observed | Written by Apache POI (`docProps/app.xml`, `dc:creator`) |
| Sheets | Observed | One sheet, named `Il Mio Patrimonio`; workbook structure is locked |
| Data extent | Observed | `B2:M17`; column A and row 1 are empty |
| Formulas | Observed | None |
| Date system | Observed | `date1904="false"`; no date-typed cells are used |
| Spaces | Observed | Plain ASCII spaces only; no non-breaking space or other control characters |
| Creation instant | Observed | `docProps/core.xml` `dcterms:created`, UTC, ISO-8601 |
| Report date | Observed | Not present in any cell; see §6 |

## 3. Sheet structure

Header text is in row 2, columns B to M. Several headers carry a trailing space (`Cambio `, `Prezzo medio di carico `, `Cambio di carico `, `Rischio (VaR) `, `Controvalore (€) `).

| Column | Header (trimmed) | Meaning in FolioDash terms | Stored as |
|---|---|---|---|
| B | Categoria / Nome prodotto | Fund house on a contract row; product name on a product row | text |
| C | (none) | Category label, two leading spaces (`  Fondi`, `  Conti correnti`) | text |
| D | Numero contratto / conto | Contract or account number | text |
| E | Intestatari / ISIN | Holder name on a contract row; ISIN on a product row | text |
| F | Data di sottoscrizione | Subscription (opening) date | text, `dd/mm/yyyy` |
| G | Quantità | Units held | number |
| H | Prezzo | Last known unit price, in the fund's currency | text |
| I | Cambio | Foreign currency units per euro, present only for non-euro funds | text |
| J | Prezzo medio di carico | Fiscal weighted-average carrying price per unit | text |
| K | Cambio di carico | Carrying exchange rate, present only for non-euro funds | text |
| L | Rischio (VaR) | Bank-published risk figure, as a fraction | number, or a single space |
| M | Controvalore (€) | Market value in euro | number; text for the grand total |

Rows come in five kinds, recognised by which columns are populated. Example values below are synthetic.

| Row kind | Populated columns | Synthetic example |
|---|---|---|
| Header | B, D to M | `Categoria / Nome prodotto`, ... |
| Category | C, M (category subtotal, numeric) | C `  Fondi`, M `1000.5` |
| Contract | B, D, E, F, L, M | B `EXAMPLE FUND HOUSE`, D `000000AA000`, E `EXAMPLE HOLDER`, F `01/02/2025`, L `0.05`, M `500.25` |
| Product | B, E, G, H, J, L, M, plus I and K for non-euro funds | B `Example Fund A Acc USD`, E `XX0000000000`, G `10.123`, H `50,123$ `, I `1,100 `, J `45,2000$ `, K `1,1500 `, L `0.05`, M `500.25` |
| Total | B (`  Totale visualizzato`), M (text) | M `1.500,75  € ` |

- **Observed:** a contract row is always followed by its product row, and the two carry the same L and M. The current-account category has a contract-style row only, with no product row and a single space in L.
- **Observed:** after the total there is one empty row, a `Note:` row and one long multi-line note in column B.
- **Observed:** the category subtotal in M equals the sum of the contract rows' M, not of contract plus product rows.
- **Not observed:** what a contract with two products looks like. Whether the contract row then holds the sum of its products is unverified.

## 4. Cell value grammar

Numbers live in two forms, and a reader needs both.

**Numeric cells (G, L, M, category subtotals).** The XML holds a locale-independent decimal such as `123.456`. Display formats in the file are `#,###,##0.000` for quantity, `0.00%` for risk and `#,###,###.00` for market value. L is a fraction (`0.0512` displays as 5.12%) and, in the sample, carries floating-point noise of the form `0.21000000000000002`.

**Text cells (F, H to K, grand total).** These hold Italian-formatted strings, written exactly like this:

| Cell | Grammar (observed forms) | Synthetic example |
|---|---|---|
| F | `dd/mm/yyyy` | `01/02/2025` |
| H, J | decimal comma, `€` or `$` directly after the digits, one trailing space; 3 decimals for H, 4 for J | `12,345€ `, `50,123$ ` |
| I, K | decimal comma, no symbol, one trailing space; 3 decimals for I, 4 for K | `1,100 `, `1,1500 ` |
| Grand total | dot for thousands, comma for decimals, two spaces then `€`, one trailing space | `1.500,75  € ` |

Observed relations between the cells:

- `$` on a price goes with a filled exchange-rate cell. `€` goes with an empty one. This held in every checked row.
- Market value ≈ quantity × price for euro funds and quantity × price ÷ exchange rate for dollar funds. This is how the exchange rate's direction was inferred (dollars per euro). Across 36 fund rows in 9 months, the largest relative deviation was about 5e-7 for euro funds and about 7e-4 for dollar funds. The gap comes from rounded displayed prices and rates, so a tolerance cannot be derived from this sample alone.
- Fund subtotal = sum of the fund contract rows, and grand total = fund subtotal + current-account value. Both held in every month that has a total (9 of 9).

The note in the file lists placeholder tokens: `-` (not present), `N.A.` (not applicable), `N.D.` (not available), `N.C.` (not calculated). None occurs in the sample. A single space does, in L of the current account. Thousands separators inside prices, negative values and prices of 1,000 or more are never observed; the total's grammar suggests `.` for thousands but that is inferred.

## 5. Proposed bank-adapter rules

These are recommendations for owner review, not accepted decisions.

1. **Read the original XLSX bytes.** The importer takes the file exactly as the bank wrote it. It must not require a re-save, and CSV extracts are not importer input, because they lose the number-versus-text distinction.
2. **Recognise the layout, then fail closed.** Identify layout v1 from the trimmed header row (B2 to M2) and one sheet, not from the sheet name or file name, which a browser or the user can change (a repeated download becomes `estrazione_prodotti_patrimonio (1).xlsx`). Anything else returns a typed unsupported-layout error naming what differs.
3. **Smooth, but verified.** The owner wants import to be as smooth as feasible, so a file that was opened and re-saved is not refused for its format alone. A closed list of known variants is normalised: a date stored as a number, a price or rate stored as a plain number, US-style separators (`12.345`, `1,234.56`) and a quantity stored as a time duration. A variant is accepted only if exactly one reading is possible and the rule 8 checks pass on the normalised values. If two readings both pass, or none does, the import stops and names the cell. Every adjustment is listed in the review step, never applied silently.
4. **Numbers.** Parse numeric cells from the XML decimal text, never through binary floating point. Round only to the precision the cell's display format declares, and reject when the discarded part exceeds a named tolerance. Convert euro amounts to exact integer cents.
5. **Text numbers.** The native form is one strict Italian grammar per column (§4). Only the variants on rule 3's list are accepted besides it. Anything else, including an unknown currency symbol, is rejected, not guessed.
6. **Dates.** The native form is `dd/mm/yyyy` text. A numeric date serial is a rule 3 variant. Impossible calendar dates are rejected.
7. **Placeholders.** The four tokens and a lone space are recognised as missing, not as zero. Whether a given column may legitimately be missing is decided per column; an unexpected missing value is an error.
8. **Reconciliation as validation.** Check each fund contract against its products, the funds subtotal against its contracts, the grand total against the category subtotals, the currency/exchange-rate pairing, and market value against quantity × price (÷ rate). A mismatch stops the import; it is never relaxed to make a file pass. These checks are also what makes rule 3 safe. The market-value tolerance is twice the rounding error of the displayed price and rate, plus one cent. It is provisional until more samples exist. The risk figure is not used in results, so an unreadable or inconsistent one is noted in the review but does not stop the import. Categories other than funds are not interpreted: they are listed with their subtotal, and the grand total is checked only when every subtotal is readable.
9. **Identity.** ISIN, validated by checksum, within the portfolio. Contract and account numbers, holder name and current-account cash stay outside the candidate model, consistent with CleanStack §6.2. FD-004 still decides what source evidence is retained.
10. **Report date comes from review.** See §6.
11. **Bytes.** Hash the original file as received (CleanStack §6.2).
12. **Nothing portfolio-specific.** The owner calls this critical. No row number, fund list, ISIN, product name, holder, contract number or fund count is built into the adapter; any number of contracts and products is accepted up to named limits. Rows are recognised by structure (§3), identity comes from the ISIN in the file, and funds that appear or disappear between exports are normal, not errors. A person importing their own export must need no configuration. The legacy script finds funds by an ISIN-shaped pattern in column E and takes the funds subtotal from the fixed cell M3. Read literally, a holder name written as one word of eight or more letters would be rejected as a malformed ISIN, and a first category other than funds would break the subtotal check. FolioDash finds the funds category by its label and tells contract rows from product rows by which columns are filled.
13. **One normalisation, coherent end to end.** The owner requires coherence from import to display. The adapter turns every accepted cell into one canonical form (table below) at a single boundary. Nothing downstream parses bank text, locale-formatted strings or display strings again, and formatting happens only at the display edge, from canonical values (CleanStack §5.1). The same pure normaliser serves the browser review and the service's authoritative check (CleanStack §6.1), and every other entry path: manual amounts, backup restore and migration from the legacy workbook. The raw cell values and the list of adjustments are kept as evidence, apart from the canonical values (FD-004).
14. **Storage never retypes a value.** Google Sheets can turn text into dates or numbers according to its locale. The legacy script writes its ledger as text cells with checksums and needed a recovery for dates that Sheets had converted. FolioDash stores canonical values as text or integers with explicit cell formats, and a write-then-read round trip through the real storage must return identical values.

**Canonical form (proposed)**

| Field | Canonical form | Notes |
|---|---|---|
| Statement date, subscription date | Date-only ISO `YYYY-MM-DD` | No time-zone shift; the export instant is stored separately as an instant |
| ISIN | Trimmed, upper case, 12 characters, checksum valid | Identity (CleanStack §5.1) |
| Product name | Trimmed plain text, at most 160 characters, no leading `=`, `+`, `-` or `@` | The legacy script rejects such names because a spreadsheet would read them as formulas |
| Market value, subtotals, total | Integer euro cents | Never binary floating point |
| Quantity | Exact decimal | Read from the XML decimal text; 3 decimals observed |
| Price, carrying price | Exact decimal plus a currency code (`EUR`, `USD`) taken from the symbol | The symbol itself is not stored |
| Exchange rate, carrying rate | Exact decimal, foreign units per euro | Absent for euro funds |
| Risk (VaR) | Exact decimal fraction, rounded to the display precision | Removes the floating-point noise |
| Missing value | An explicit absent state | Not zero and not an empty string |

## 6. Report date

No cell holds the statement date. Owner-confirmed: the bank exports only the current state and offers no date selector, so the statement date is the day the export is made, whichever day of the month that is. The owner renames each file to `YYYY-MM-DD.xlsx` so the legacy script can read the date from the name; the bank's own file name, `estrazione_prodotti_patrimonio.xlsx`, carries no date. In the sample, the creation instant (`dcterms:created`, 10:48 UTC) matches the typed name and the file's modification time on the owner's Mac (one hour ahead of UTC), so it records when the export was made.

Proposed: the user never has to rename a file. Take the candidate statement date from the creation instant converted to the user's time zone (the UTC date alone can be the previous day shortly after midnight), then fall back to a date in the file name (present only if the user renamed the file), then to the browser's last-modified time. Show the candidate and have the user confirm it in the review step. Re-saving can rewrite the creation instant, and a name the user typed is a label, so neither is proof (CleanStack §6.2). The file's note says values use the last known NAV/price, and no NAV date is exported, so the export date is an upper bound on price freshness, not the price date itself. Exports fall on arbitrary days, so a mid-month export is normal; FD-006 and FD-007 must say how it is reported against its month (CleanStack §5.3 already separates an as-of month from a true month-end).

## 7. Required synthetic fixtures

None exist. Before the adapter is called supported, the parsing gate (CleanStack §13.2) needs synthetic files, with no real names, numbers or ISINs, covering at least:

- A clean file with euro and dollar funds and a current account, in the bank's exact typing.
- Prices of 1,000 or more, thousands separators, and every placeholder token.
- A numeric date, a price stored as a number, and a quantity stored as a time duration.
- US-style separators, a missing currency symbol, an unknown currency symbol and a non-breaking space.
- A wrong or missing exchange rate, an invalid ISIN checksum and a duplicate ISIN.
- A subtotal or grand-total mismatch, and a contract row that disagrees with its product row.
- A contract with two products, a category with no rows and an extra category.
- A second sheet, a changed header, a formula cell and a file with extra rows after the note.
- Bounded hostile XLSX inputs (oversized, many sheets, external links, macros).
- Coherence proofs: normalising an already-normalised value changes nothing, a write-then-read round trip through the real storage returns identical values, and the stored, displayed and charted value of the same figure agree.

## 8. Why verified, not trusted

Six of the 17 historical months were changed after export. In four of them a quantity was stored as a time duration, and it could not be recovered from the stored number alone: several different quantities map to the same value. It was restored using the neighbouring months and the market-value relation as independent checks; in those four months the market-value check points to the same answer. A file that is accepted after silent reformatting can carry exactly this kind of error into financial history, which is why §5 accepts a re-saved variant only when independent checks pass, stops when they leave more than one answer, and lists every adjustment.

Reconstructed or hand-edited months, if they are imported, keep a visible reconstructed label and do not become bank-issued originals (CleanStack §6.2).

## 9. Decisions and proposed defaults

Resolved by the owner on 2026-11-01: a snapshot is dated by the export day (§6), the owner renames the files because the bank's name carries no date, portfolio-independence is a critical requirement (§5 rule 12), and import should be as smooth as feasible, so re-saved files are accepted when verified (§5 rule 3).

The owner asked for the remaining questions to be answered from the legacy Apps Script project. The four defaults below are derived from it. They are proposals for owner review, not accepted decisions.

1. **The 6 re-saved or retyped months.** The legacy script reads only product name (B), ISIN (E), market value (M) and the funds subtotal (M3), and its money reader already accepts Italian and US separators. Its Monthly Recap has all 17 month columns, so it took these months as normal. Proposed: import them like any other month through §5 rule 3, with provenance "normalised", not "reconstructed". Their figures reconcile like genuine exports, so they look like real exports pasted back with another number format. If one was typed by hand it should be labelled reconstructed (CleanStack §6.2). No second workbook helps here: the one supplied has the same 6 deviations.
2. **Several exports in one month.** The legacy script allows one statement per calendar month (its date check compares year × 12 + month) and corrects only the latest one, keeping the archived source. Proposed: v1 keeps one statement per calendar month, because month-on-month, year-to-date, year-on-year and averages assume it and CleanStack §5.2 treats cash between intermediate snapshots as unsolved. Store the exact export date as the key, so several per month (FD-006) can be added later without a migration. A second export in the latest month offers to replace that statement through the correction path, keeping the older revision. Replacing an earlier month is not offered (CleanStack §7).
3. **Categories other than funds.** The legacy script collects every ISIN-shaped value in column E and requires their total to match the funds subtotal, so a category with ISINs makes it stop and one without is ignored. Proposed: find the funds category by its label and track only that. List every other category with its subtotal in the review as "not tracked", and reconcile the grand total, so nothing is dropped silently. Layouts for those categories cannot be specified until a sample export contains them.
4. **Extra bank columns.** The legacy script ignores quantity, price, exchange rates, carrying cost and VaR. Proposed: parity for v1. Results use only ISIN, name and market value. The other columns are read for the §5 rule 3 and rule 8 checks and are not used in results until FD-007 approves a method, for example detecting units bought or sold.

## 10. Verification status

| Item | State |
|---|---|
| Layout facts in §2 to §4 | Observed from one real export and one private workbook; not independently reviewed |
| Reconciliation relations in §4 | Computed over 9 months; tolerance undecided |
| Adapter rules in §5 | Proposed |
| Interpreter (sheet cells to candidate statement) | Implemented in `src/adapters/fideuram/` with synthetic fixtures and tests; passes `npm run verify`. UI and storage are not implemented |
| XLSX file reader | Implemented in `src/adapters/xlsx/` with no third-party dependency. Reads a file held in memory into cells and runs in the browser. Bounded: file, part, expansion, XML depth, element, row, column and cell limits (provisional, FD-012). Rejects encrypted, zip64, duplicate-part, checksum-failing and macro files and any XML document type declaration. Formulas are reported as formula cells and never evaluated; external links are never followed. Tested on synthetic files, including a zip bomb and an entity-expansion attempt |
| Check against real files | Run locally only, with nothing committed, through the XLSX reader and the interpreter: the bank export (no adjustment needed) and the 17 historical sheets in both supplied workbooks were read, in milliseconds. 9 of the 17 needed no adjustment. The other 8 were read with the adjustments listed (re-saved number formats, and early months that lack the account and total lines), and the four time-formatted quantities resolved to the same values as the neighbouring months |
| Second real export | Not available |
