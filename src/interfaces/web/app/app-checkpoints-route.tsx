import type { JSX } from "preact";
import type { SessionState } from "../../../applications/session/session-model";
import type { IsoDate } from "../../../core/values/iso-date";
import type { Checkpoint } from "../../../core/portfolio/checkpoints";
import { CheckpointsView } from "./app-views";
import type { CheckpointSessionState } from "./session/checkpoint/checkpoint-session-core";
import type { Session } from "./session/session";

export function CheckpointsRoute(props: {
  data: SessionState;
  checkpointData: CheckpointSessionState;
  shownCheckpoints: readonly Checkpoint[];
  today: IsoDate;
  session: Session;
}): JSX.Element {
  const { data, checkpointData, shownCheckpoints, today, session } = props;
  return (
    <CheckpointsView
      key={checkpointData.generation}
      signedOut={data.mode === "signed-out"}
      state={{
        ready: data.mode === "signed-out" || checkpointData.ready,
        active: shownCheckpoints,
        pending: data.mode === "signed-out" ? [] : checkpointData.pending,
        unreadable: data.mode !== "signed-out" && checkpointData.receiptsUnreadable,
        message: data.mode === "signed-out" ? "" : checkpointData.message,
        preserved:
          data.mode === "signed-out"
            ? []
            : checkpointData.preserved.map((entry) => ({
                workbookId: entry.workbookId,
                active: entry.active,
                pending: entry.pending,
                unreadable: entry.unreadable,
              })),
      }}
      today={today}
      onAdd={(request) => session.checkpoints.add(request)}
      onVoid={(id) => session.checkpoints.void(id)}
      onCheck={() => session.checkpoints.checkPending()}
      preservedText={(id, masked) => session.checkpoints.preservedText(id, masked)}
    />
  );
}
