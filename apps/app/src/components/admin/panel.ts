import { createContext, useContext } from "react";

export type PanelRole = "moderator" | "admin";

export interface PanelContext {
  role: PanelRole;
  /** Pending notes, for the side bar's count; pages bump it after a review. */
  pending: number | null;
  refreshPending: () => void;
}

export const Panel = createContext<PanelContext>({ role: "moderator", pending: null, refreshPending: () => {} });

export const usePanel = () => useContext(Panel);
