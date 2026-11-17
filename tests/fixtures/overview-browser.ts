// Local browser harness: the Portfolio shown from invented data as if it were a person's own recorded statements.
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { parseIsoDate, type IsoDate } from "../../src/core/iso-date";
import { demoLedger } from "../../src/interfaces/web/app/demo-portfolio";
import { overviewFromLedger } from "../../src/interfaces/web/app/overview-from-ledger";
import { OverviewView } from "../../src/interfaces/web/features/overview/overview-view";
import { PrivacyProvider } from "../../src/interfaces/web/presentation/privacy/privacy";

const model = overviewFromLedger(demoLedger("long"), "recorded");
const lastStatement = model.dates[model.dates.length - 1];

function day(text: string): IsoDate {
  const date = parseIsoDate(text);
  if (date === null) throw new Error("Invalid synthetic date");
  return date;
}

let apply: (change: { today?: IsoDate; pending?: boolean }) => void = () => undefined;

function Harness() {
  const [state, setState] = useState<{ today: IsoDate; pending: boolean }>({
    today: day("2027-08-01"),
    pending: false,
  });
  apply = (change) => {
    setState((current) => ({ today: change.today ?? current.today, pending: change.pending ?? current.pending }));
  };
  return h(PrivacyProvider, {
    hidden: false,
    children: h(OverviewView, {
      model,
      range: "All",
      onRangeChange: () => undefined,
      today: state.today,
      pendingChange: state.pending,
    }),
  });
}

const root = document.getElementById("root");
if (root === null) throw new Error("Synthetic mount missing");
render(h(Harness, {}), root);
Object.assign(window, {
  syntheticOverview: {
    lastStatement,
    setToday: (text: string) => {
      apply({ today: day(text) });
    },
    setPending: (pending: boolean) => {
      apply({ pending });
    },
  },
});
