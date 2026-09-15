// VS Code-style Lua editor built on Monaco (the same editor engine as VS Code):
// line numbers, Lua syntax highlighting, and IntelliSense including custom
// completions for the simulator's ic.* / ss.* API.
//
// Monaco's web workers are bundled locally (via Vite ?worker imports) so the
// editor works offline and doesn't depend on a CDN.

import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import Editor, {
  loader,
  type BeforeMount,
  type OnMount,
  type Monaco,
} from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { API_COMPLETIONS } from "./editorCompletions";
import { LUA_THEME_NAME, registerLuaLanguage } from "./luaLang";

// Bundle Monaco locally instead of fetching from a CDN. Web workers are wired
// up by vite-plugin-monaco-editor (see vite.config.ts), so no manual
// MonacoEnvironment setup is needed here.
loader.config({ monaco });

/**
 * Imperative handle for driving the editor from outside (e.g. "go to code"
 * navigation from the designer). Held in a ref shared with the owner.
 */
export interface EditorHandle {
  /** Reveal and place the cursor at a 1-based line (optional 1-based column). */
  goToLine: (line: number, column?: number) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /**
   * Shared handle ref. The editor fills it on mount so callers can drive the
   * cursor. Because this component unmounts when its tab is inactive, a
   * navigation requested while unmounted is queued and applied on next mount.
   */
  handleRef?: MutableRefObject<EditorHandle | null>;
  /** A pending line to jump to as soon as the editor mounts (1-based). */
  pendingLineRef?: MutableRefObject<number | null>;
}

let completionsRegistered = false;

// Register ic. and ss. completions once, globally, for the Lua language.
function registerCompletions(monacoInstance: Monaco) {
  if (completionsRegistered) return;
  completionsRegistered = true;

  monacoInstance.languages.registerCompletionItemProvider("lua", {
    // Trigger after typing a dot (member access) and normally.
    triggerCharacters: ["."],
    provideCompletionItems: (
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      // Text just before the cursor, to scope member completions (ic. / ss.).
      const line = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const suggestions = API_COMPLETIONS.filter((c) => {
        if (!c.scope) return true; // globals available everywhere
        // Member completions only when the preceding text ends with "<scope>."
        return new RegExp(`${c.scope}\\.[\\w]*$`).test(line);
      }).map((c) => ({
        label: c.label,
        kind:
          c.kind === "function"
            ? monacoInstance.languages.CompletionItemKind.Function
            : c.kind === "field"
              ? monacoInstance.languages.CompletionItemKind.Field
              : monacoInstance.languages.CompletionItemKind.Variable,
        insertText: c.insertText ?? c.label,
        insertTextRules: c.snippet
          ? monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        documentation: c.doc,
        detail: c.detail,
        range,
      }));

      return { suggestions };
    },
  });
}

export function CodeEditor({ value, onChange, handleRef, pendingLineRef }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const goToLine = useCallback((line: number, column = 1) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column });
    ed.focus();
  }, []);

  // Clear the shared handle when this editor unmounts (it does so whenever the
  // Script tab is inactive) so callers queue via pendingLineRef instead of
  // driving a disposed editor instance.
  useEffect(() => {
    return () => {
      editorRef.current = null;
      if (handleRef) handleRef.current = null;
    };
  }, [handleRef]);

  // Install the enhanced Lua grammar + theme before the editor is created so
  // the `theme` prop below resolves to it on first paint.
  const beforeMount: BeforeMount = useCallback((monacoInstance) => {
    registerLuaLanguage(monacoInstance);
  }, []);

  const onMount: OnMount = useCallback(
    (editor, monacoInstance) => {
      editorRef.current = editor;
      registerLuaLanguage(monacoInstance);
      registerCompletions(monacoInstance);
      if (handleRef) handleRef.current = { goToLine };
      // Apply a navigation that was requested before this editor existed
      // (e.g. the user was on the Design tab and clicked "go to code").
      if (pendingLineRef && pendingLineRef.current != null) {
        const line = pendingLineRef.current;
        pendingLineRef.current = null;
        // Defer one frame so layout/scroll is ready.
        requestAnimationFrame(() => goToLine(line));
      }
    },
    [goToLine, handleRef, pendingLineRef]
  );

  return (
    <div className="code-editor">
      <Editor
        height="100%"
        defaultLanguage="lua"
        theme={LUA_THEME_NAME}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        beforeMount={beforeMount}
        onMount={onMount}
        options={{
          fontSize: 13,
          fontFamily: '"Cascadia Code", "Consolas", monospace',
          minimap: { enabled: false },
          lineNumbers: "on",
          tabSize: 2,
          insertSpaces: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          renderWhitespace: "selection",
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
        }}
      />
    </div>
  );
}
