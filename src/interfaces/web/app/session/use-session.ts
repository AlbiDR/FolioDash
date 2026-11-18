import type { SessionState } from "../../../../applications/session/session-model";
import { useEffect, useState } from "preact/hooks";
import type { Session } from "./session";
import type { ExpenseSessionState } from "./expense/expense-session-core";
import type { CheckpointSessionState } from "./checkpoint-session";

export function useExpenses(session: Session): ExpenseSessionState {
  const [state, setState] = useState(session.expenses.state);
  useEffect(() => {
    setState(session.expenses.state);
    return session.expenses.subscribe(() => {
      setState(session.expenses.state);
    });
  }, [session]);
  return state;
}

export function useCheckpoints(session: Session): CheckpointSessionState {
  const [state, setState] = useState(session.checkpoints.state);
  useEffect(() => {
    setState(session.checkpoints.state);
    return session.checkpoints.subscribe(() => {
      setState(session.checkpoints.state);
    });
  }, [session]);
  return state;
}

/** The session's current state, redrawn whenever it changes. */
export function useSession(session: Session): SessionState {
  const [state, setState] = useState(session.state);
  useEffect(() => {
    setState(session.state);
    return session.subscribe(() => {
      setState(session.state);
    });
  }, [session]);
  return state;
}

/** The current time, refreshed on an interval, so "synced 5 minutes ago" stays true without a reload. */
export function useNow(intervalMilliseconds: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMilliseconds);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMilliseconds]);
  return now;
}
