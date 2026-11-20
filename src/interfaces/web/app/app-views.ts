import { lazy } from "preact/compat";
import type { ImportPreparer } from "../../../applications/import/import-model";

export const ExpensesView = lazy(async () => ({
  default: (await import("../features/expenses/expenses-view")).ExpensesView,
}));
export const ActivityView = lazy(async () => ({
  default: (await import("../features/activity/activity-view")).ActivityView,
}));
export const CheckpointsView = lazy(async () => ({
  default: (await import("../features/checkpoints/checkpoints-view")).CheckpointsView,
}));
export const ExpenseDataTools = lazy(async () => ({
  default: (await import("../features/expenses/expense-data-tools")).ExpenseDataTools,
}));
export const AccountView = lazy(async () => ({
  default: (await import("../features/account/account-view")).AccountView,
}));
export const HistoryView = lazy(async () => ({
  default: (await import("../features/history/history-view")).HistoryView,
}));
export const ImportView = lazy(async () => ({ default: (await import("../features/import/import-view")).ImportView }));
export const prepareImport: ImportPreparer = async (file) => {
  try {
    return await (await import("./session/import-preparer")).prepareImport(file);
  } catch {
    return {
      status: "unreadable-file",
      message: "The import tools or file could not be loaded. Check your connection, then select the file again.",
    };
  }
};
