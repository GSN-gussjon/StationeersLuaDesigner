// Fetch and parse the bundled sample dataset (public/samples/*.json). Shared by
// the manual "Sample" button and the startup auto-load so there's one code path.

import { parseCatalog, type ParseResult } from "./parseStationpedia";

export async function loadSampleDataset(): Promise<ParseResult> {
  const base = import.meta.env.BASE_URL;
  const [pediaText, enumsText] = await Promise.all([
    fetch(`${base}samples/Stationpedia.json`).then((r) => {
      if (!r.ok) throw new Error(`Stationpedia.json: HTTP ${r.status}`);
      return r.text();
    }),
    fetch(`${base}samples/Enums.json`).then((r) => {
      if (!r.ok) throw new Error(`Enums.json: HTTP ${r.status}`);
      return r.text();
    }),
  ]);
  return parseCatalog(pediaText, enumsText);
}
