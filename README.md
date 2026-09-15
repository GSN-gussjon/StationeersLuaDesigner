# StationeersLuaDesigner

A browser-based simulator and visual layout designer for **Stationeers**
ScriptedScreens Lua UIs. Write and run chip scripts against a mocked `ic.*` /
`ss.*` API, preview the screen interactively, and design layouts visually with
a WinForms-style Designer that stays in sync with the script.

- **Script tab** — Monaco (VS Code) editor with Lua highlighting and `ic.` /
  `ss.` completions, running on a Wasmoon (WASM) Lua runtime.
- **Screen tab** — interactive preview of the committed UI.
- **Design tab** — drag/drop layout editor (panels, buttons, charts, gauges,
  flex/grid auto-layout, icons) with two-way sync to the script's designer
  block.

## License

MIT — see [LICENSE](./LICENSE). © 2026 Gussjon.

Bundled third-party software and its licenses are listed in
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

## Disclaimer & attribution

This is an **unofficial, fan-made** tool. It is not affiliated with, endorsed
by, or associated with RocketWerkz Ltd. or the ScriptedScreens mod team.
**Stationeers** is a trademark of RocketWerkz Ltd.

- API names, element properties, and behavior follow the
  **ScriptedScreens documentation** (OrbitalFoundryModTeam). No documentation
  text is reproduced verbatim.
- The bundled sample dataset is a small, hand-authored demonstration set;
  device and enum names originate from Stationeers and are used for
  interoperability and educational purposes only.
