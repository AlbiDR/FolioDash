import type { JSX } from "preact";
import type { Dispatch, StateUpdater } from "preact/hooks";
import type { SessionState } from "../../../applications/session/session-model";
import type { Route } from "./routes";
import { HistoryView, ImportView, prepareImport } from "./app-views";
import type { Session } from "./session/session";

export function ImportRoutes(props: {
  route: Route;
  data: SessionState;
  jsonImportLocked: boolean;
  statementLocked: boolean;
  setStatementLocked: Dispatch<StateUpdater<boolean>>;
  setJsonImportLocked: Dispatch<StateUpdater<boolean>>;
  session: Session;
}): JSX.Element {
  const { route, data, jsonImportLocked, statementLocked, setStatementLocked, setJsonImportLocked, session } = props;
  return (
    <>
      {route.name === "import" && (
        <div inert={jsonImportLocked}>
          <ImportView
            key={data.workbook?.id ?? "signed-out"}
            prepare={prepareImport}
            ledger={data.ledger}
            {...(data.workbook === null ? {} : { workbookId: data.workbook.id })}
            createRevision={() => crypto.randomUUID()}
            onRecord={() => undefined}
            save={session.save}
            onWorkflowLock={setStatementLocked}
          />
        </div>
      )}
      {route.name === "history" && (
        <div inert={jsonImportLocked}>
          <ImportView
            historyMode
            prepare={prepareImport}
            ledger={data.ledger}
            createRevision={() => crypto.randomUUID()}
            onRecord={() => undefined}
            save={session.save}
            onWorkflowLock={setStatementLocked}
          />
        </div>
      )}
      {(route.name === "import" || route.name === "history") && (
        <div class="more" inert={statementLocked}>
          <details>
            <summary>Import an existing FolioDash JSON history file</summary>
            <HistoryView
              ledger={data.ledger}
              onLedger={() => undefined}
              save={session.save}
              onWorkflowLock={setJsonImportLocked}
            />
          </details>
        </div>
      )}
    </>
  );
}
