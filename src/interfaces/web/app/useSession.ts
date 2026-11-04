import type { SessionState } from "../../../applications/SessionModel";
import { useEffect, useState } from "preact/hooks";
import type { Session } from "./session";

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
