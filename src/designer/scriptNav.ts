// Upward navigation channel from the designer to the Script tab + code editor.
// Created by EditorPane (which owns the tab state and the editor handle) and
// consumed by the PropertiesPanel "go to code" button. Kept in its own module
// so both sides can import the context without a circular dependency.

import { createContext, useContext } from "react";

export interface ScriptNav {
  /**
   * Switch to the Script tab and place the cursor inside the given handler
   * function's body. No-op when the function can't be located.
   */
  goToHandler: (functionName: string) => void;
}

export const ScriptNavContext = createContext<ScriptNav | null>(null);

/** Access the script-navigation channel (null when not provided). */
export function useScriptNav(): ScriptNav | null {
  return useContext(ScriptNavContext);
}
