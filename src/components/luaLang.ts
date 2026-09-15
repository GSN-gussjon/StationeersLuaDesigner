// Richer Lua syntax highlighting for Monaco, tuned to look like VS Code's
// Dark+ theme. Monaco ships a basic Lua Monarch grammar, but it tags table
// keys, function-call names and property access all as plain identifiers, so
// vs-dark renders them flat grey. We override the `lua` tokenizer to emit
// distinct token types and pair it with a matching dark theme.
//
// Token types produced (mapped to theme rules in LUA_DARK_THEME):
//   keyword, keyword.self, constant.language (true/false/nil),
//   support.function (print, pairs, …), variable.language (ss/ic globals),
//   entity.name.function (name being defined / called), variable.parameter,
//   property (table key before '='), variable.other.property (after a dot),
//   string, number, comment, delimiter, delimiter.bracket, operator.

import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";

const LUA_KEYWORDS = [
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then",
  "true", "until", "while",
];

// Standard Lua library callables commonly used in chip scripts.
const LUA_BUILTINS = [
  "assert", "collectgarbage", "dofile", "error", "getmetatable", "ipairs",
  "load", "loadfile", "next", "pairs", "pcall", "print", "rawequal", "rawget",
  "rawlen", "rawset", "require", "select", "setmetatable", "tonumber",
  "tostring", "type", "xpcall", "unpack",
];

/**
 * Monarch tokenizer for Lua. The key improvements over Monaco's default:
 *  - `key =` inside tables → `property`
 *  - `name(` (a call) and `function name` → `entity.name.function`
 *  - `.field` member access → `variable.other.property`
 *  - `ss` / `ic` API roots → `variable.language`
 *  - true/false/nil → `constant.language`
 */
export const LUA_MONARCH: languages.IMonarchLanguage = {
  defaultToken: "",
  keywords: LUA_KEYWORDS,
  builtins: LUA_BUILTINS,
  brackets: [
    { open: "{", close: "}", token: "delimiter.bracket" },
    { open: "[", close: "]", token: "delimiter.bracket" },
    { open: "(", close: ")", token: "delimiter.parenthesis" },
  ],
  operators: [
    "+", "-", "*", "/", "%", "^", "#", "==", "~=", "<=", ">=", "<", ">", "=",
    ";", ":", ",", ".", "..", "...",
  ],
  // eslint-disable-next-line no-useless-escape
  symbols: /[=><!~?:&|+\-*\/\^%#\.]+/,
  tokenizer: {
    root: [
      // Comments: long-bracket and line.
      [/--\[(=*)\[/, "comment", "@longcomment.$1"],
      [/--.*$/, "comment"],

      // Long strings [[ ... ]] / [=[ ... ]=].
      [/\[(=*)\[/, "string", "@longstring.$1"],

      // function <name>  → definition name.
      [/\b(function)(\s+)([A-Za-z_]\w*(?:[.:]\w+)*)/,
        ["keyword", "white", "entity.name.function"]],

      // table key:  ident =   (but not == comparison).
      [/[A-Za-z_]\w*(?=\s*=(?!=))/, "property"],

      // property access:  .field  or  :method
      [/([.:])([A-Za-z_]\w*)/, ["delimiter", "variable.other.property"]],

      // function call:  name(
      [/[A-Za-z_]\w*(?=\s*\()/, "entity.name.function"],

      // Identifiers, keywords, builtins, constants, API roots.
      [/[A-Za-z_]\w*/, {
        cases: {
          "true|false|nil": "constant.language",
          "self": "keyword.self",
          "ss|ic": "variable.language",
          "@keywords": "keyword",
          "@builtins": "support.function",
          "@default": "identifier",
        },
      }],

      // Whitespace.
      [/[ \t\r\n]+/, "white"],

      // Numbers (hex + decimal + exponent).
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/\d+(\.\d+)?([eE][-+]?\d+)?/, "number"],
      [/\.\d+([eE][-+]?\d+)?/, "number"],

      // Strings.
      [/"/, "string", "@string_double"],
      [/'/, "string", "@string_single"],

      // Brackets / delimiters / operators.
      [/[{}()\[\]]/, "@brackets"],
      [/@symbols/, {
        cases: { "@operators": "operator", "@default": "delimiter" },
      }],
    ],

    string_double: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],
    string_single: [
      [/[^\\']+/, "string"],
      [/\\./, "string.escape"],
      [/'/, "string", "@pop"],
    ],
    longstring: [
      [/[^\]]+/, "string"],
      [/\](=*)\]/, {
        cases: {
          "$1==$S2": { token: "string", next: "@pop" },
          "@default": "string",
        },
      }],
      [/./, "string"],
    ],
    longcomment: [
      [/[^\]]+/, "comment"],
      [/\](=*)\]/, {
        cases: {
          "$1==$S2": { token: "comment", next: "@pop" },
          "@default": "comment",
        },
      }],
      [/./, "comment"],
    ],
  },
};

/** VS Code Dark+ style token colors for the Lua tokens above. */
export const LUA_DARK_THEME: import("monaco-editor").editor.IStandaloneThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
    { token: "keyword", foreground: "569CD6" },
    { token: "keyword.self", foreground: "569CD6", fontStyle: "italic" },
    { token: "constant.language", foreground: "569CD6" },
    { token: "support.function", foreground: "DCDCAA" },
    { token: "entity.name.function", foreground: "DCDCAA" },
    { token: "variable.language", foreground: "4EC9B0" },
    { token: "property", foreground: "9CDCFE" },
    { token: "variable.other.property", foreground: "9CDCFE" },
    { token: "variable.parameter", foreground: "9CDCFE" },
    { token: "identifier", foreground: "D4D4D4" },
    { token: "string", foreground: "CE9178" },
    { token: "string.escape", foreground: "D7BA7D" },
    { token: "number", foreground: "B5CEA8" },
    { token: "number.hex", foreground: "B5CEA8" },
    { token: "operator", foreground: "D4D4D4" },
    { token: "delimiter", foreground: "D4D4D4" },
    { token: "delimiter.bracket", foreground: "FFD700" },
    { token: "delimiter.parenthesis", foreground: "D4D4D4" },
  ],
  colors: {
    "editor.background": "#0b0f14",
  },
};

export const LUA_THEME_NAME = "ss-lua-dark";

let registered = false;

/**
 * Install the enhanced Lua grammar + theme. Idempotent (safe to call on every
 * editor mount). Overrides Monaco's built-in `lua` tokenizer.
 */
export function registerLuaLanguage(monacoInstance: Monaco): void {
  if (registered) return;
  registered = true;

  // The 'lua' language id is already contributed by monaco-editor; ensure it
  // exists, then override its tokenizer with the richer grammar.
  const langs = monacoInstance.languages.getLanguages();
  if (!langs.some((l: languages.ILanguageExtensionPoint) => l.id === "lua")) {
    monacoInstance.languages.register({ id: "lua" });
  }
  monacoInstance.languages.setMonarchTokensProvider("lua", LUA_MONARCH);
  monacoInstance.editor.defineTheme(LUA_THEME_NAME, LUA_DARK_THEME);
}
