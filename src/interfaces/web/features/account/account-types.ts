import type {
  ConnectOutcome,
  RestoreOutcome,
  SessionState,
  TidyOutcome,
  VerifyOutcome,
} from "../../../../applications/session/session-model";
import type { RemoteSave } from "../../../../applications/import/import-model";

export interface AccountActions {
  connect(): Promise<ConnectOutcome>;
  refresh(): Promise<ConnectOutcome>;
  /** Renews Google access with the remembered account, or lets the person choose another. */
  reconnect(options?: { readonly differentAccount?: boolean }): Promise<ConnectOutcome>;
  restore(): Promise<RestoreOutcome>;
  verify(): Promise<VerifyOutcome>;
  tidy(): Promise<TidyOutcome>;
  forget(): void;
  /** Remembers a client ID on this device. Returns false if it is not shaped like one. */
  setClientId(text: string): boolean;
}

export interface AccountViewProps {
  readonly state: SessionState;
  readonly now: number;
  readonly clientConfigured: boolean;
  readonly actions: AccountActions;
  /** Which build of the app this page is running, so a stale page is never mistaken for the new one. */
  readonly build: string;
  readonly expenseCommands?: number;
  /** How many checkpoints this device holds (the connected workbook and any preserved copies). */
  readonly checkpointCount?: number;
  readonly revisionSave?: RemoteSave;
}
