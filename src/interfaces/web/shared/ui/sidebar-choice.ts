const KEY = "foliodash.sidebar.v1";

/** The slice of localStorage used, so the behaviour can be tested and a blocked store is survivable. */
export interface SidebarStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Whether the person chose to hide the sidebar. Open is the default; only this one choice is remembered. */
export function readSidebarCollapsed(open: () => SidebarStorage): boolean {
  try {
    return open().getItem(KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(open: () => SidebarStorage, collapsed: boolean): void {
  try {
    open().setItem(KEY, collapsed ? "collapsed" : "open");
  } catch {
    // Not remembered; the sidebar still works.
  }
}
