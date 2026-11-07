import { createContext, useContext } from "react";

export type PanelRole = "moderator" | "admin";

export interface PanelContext {
  role: PanelRole;
  /** Pending notes, for the side bar's count; pages bump it after a review. */
  pending: number | null;
  refreshPending: () => void;
  /** Whether this API has Veri Döngüsü's routes (INTAKE_ENABLED): only then is Sohbetten Kabul shown. */
  intake: boolean;
}

export const Panel = createContext<PanelContext>({ role: "moderator", pending: null, refreshPending: () => {}, intake: false });

export const usePanel = () => useContext(Panel);
