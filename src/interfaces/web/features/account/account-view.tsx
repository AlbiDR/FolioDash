import type { JSX } from "preact";
import { PageNav } from "../../shared/ui/page-nav";
import { AccountClientId } from "./account-client-id";
import { AccountConnectionCard } from "./account-connection-card";
import { AccountDeviceSection } from "./account-device-section";
import { AccountHealth, AccountHistoryRecovery, AccountOrganize, AccountRestore } from "./account-maintenance";
import type { AccountViewProps } from "./account-types";
import { useAccountController } from "./use-account-controller";
import { Presence } from "../../shared/ui/presence";

/** The one place to see and control where the person's data lives. Plain words, one clear next step. */
export function AccountView(props: AccountViewProps): JSX.Element {
  const x = useAccountController(props);
  const shared = { props, x };
  const { state, pending, busy, signedOut } = x;

  return (
    <section class="account screen" aria-labelledby="account-connection-heading">
      <p class="account-lead">Check synchronization, verify your saved history and manage the copy on this device.</p>
      <div class="status" data-busy={busy} aria-live="polite">
        <Presence show={pending !== null}>
          {pending !== null && (
            <p>
              {pending === "connect"
                ? "Waiting for Google…"
                : pending === "sync"
                  ? "Checking your latest saved history…"
                  : pending === "restore"
                    ? "Restoring your spreadsheet and checking the result…"
                    : pending === "restore-history"
                      ? "Restoring or checking your previous portfolio history…"
                      : pending === "verify"
                        ? "Reading and checking your saved statements…"
                        : "Checking and organizing your spreadsheet…"}
            </p>
          )}
        </Presence>
      </div>

      <AccountConnectionCard shared={shared} />

      {!signedOut && state.workbook !== null && (
        <PageNav
          items={[
            { id: "account-health-heading", label: "Verify" },
            { id: "account-maintenance-heading", label: "Organize" },
            { id: "account-device-heading", label: "Storage" },
          ]}
        />
      )}

      <AccountHistoryRecovery shared={shared} />

      <AccountHealth shared={shared} />

      <AccountOrganize shared={shared} />

      <AccountRestore shared={shared} />

      <AccountDeviceSection shared={shared} />

      <AccountClientId shared={shared} />
      <p class="footnote build-stamp">FolioDash build: {props.build}</p>
    </section>
  );
}
