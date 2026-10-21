import { createContext, useContext } from "react";

/** Eyebrow shown above every Manager-shell page title; the shell sets "Admin workspace" for an Admin. */
export const WorkspaceLabelContext = createContext("Manager workspace");

export function useWorkspaceLabel() {
  return useContext(WorkspaceLabelContext);
}

export function WorkspaceEyebrow() {
  return <p className="eyebrow">{useWorkspaceLabel()}</p>;
}
