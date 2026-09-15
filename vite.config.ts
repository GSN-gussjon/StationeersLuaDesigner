import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorPlugin from "vite-plugin-monaco-editor";

// vite-plugin-monaco-editor's default export interop varies by version; grab a
// callable regardless of whether it's the default or a nested .default.
const monaco = (
  (monacoEditorPlugin as unknown as { default?: typeof monacoEditorPlugin })
    .default ?? monacoEditorPlugin
) as typeof monacoEditorPlugin;

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages serves this project repo from /<repo>/, so assets must be
  // prefixed accordingly. Overridable via BASE_PATH for other hosts / local
  // `vite preview` (where "/" is expected).
  base: process.env.BASE_PATH ?? "/StationeersLuaDesigner/",
  plugins: [
    react(),
    // Bundles Monaco's web workers locally and wires up MonacoEnvironment.
    // Lua uses only the base editor worker (no dedicated language worker).
    monaco({ languageWorkers: ["editorWorkerService"] }),
  ],
  // wasmoon is published as CommonJS. Let Vite pre-bundle it so named exports
  // (LuaFactory) are correctly interop'd to ESM; excluding it breaks the import.
  optimizeDeps: {
    include: ["wasmoon"],
  },
});
