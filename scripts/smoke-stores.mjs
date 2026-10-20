/**
 * Runtime smoke test for the store changes made in this session.
 * Run with: node scripts/smoke-stores.mjs
 *
 * The Tauri `invoke` layer is stubbed so the stores can be exercised
 * in plain Node without a native backend.
 */
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "stillroom-smoke-"));

// Stub for @tauri-apps/api/core and the local commands/tauri module.
// Both stubs share one call log via globalThis so the test can inspect
// calls made through either module.
const stub = `
const g = globalThis;
if (!g.__smokeCalls) g.__smokeCalls = [];
const calls = g.__smokeCalls;
export const __calls = calls;
export const invoke = async (cmd, args) => {
  calls.push([cmd, args]);
  if (cmd === "get_items" || cmd === "get_library_items") return [];
  if (cmd === "get_albums") return [];
  if (cmd === "get_tags") return [];
  return null;
};
export const tauri = {
  items: {
    toggleFavorite: async (id, favorite) => { calls.push(["favorite", id, favorite]); },
    toggleHidden: async (id, hidden) => { calls.push(["hidden", id, hidden]); },
    updateTags: async () => {},
    revealInFinder: async () => {},
  },
  library: { getItems: async () => [] },
  albums: { get: async () => [], getTags: async () => [] },
};
export const formatBytes = (n) => String(n);
export const formatBytesSimple = (n) => String(n);
`;

const entry = join(tmp, "entry.ts");
writeFileSync(
  entry,
  `
import { useLibraryStore } from "${root}src/engine/stores/useLibraryStore";
import { useViewerStore } from "${root}src/engine/stores/useViewerStore";
import { __calls } from "@tauri-apps/api/core";

export { useLibraryStore, useViewerStore, __calls };
`
);

const outfile = join(tmp, "bundle.mjs");
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  plugins: [
    {
      name: "stub-tauri",
      setup(b) {
        b.onResolve({ filter: /^@tauri-apps\/api\/core$/ }, () => ({ path: "stub-core", namespace: "stub" }));
        b.onResolve({ filter: /commands\/tauri$/ }, () => ({ path: "stub-cmd", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: stub, loader: "js" }));
      },
    },
  ],
});

const mod = await import(pathToFileURL(outfile).href);
const { useLibraryStore, useViewerStore, __calls } = mod;

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

// ---- Seed the library with three items -------------------------------
const mk = (id, over = {}) => ({
  id,
  path: `/tmp/${id}.jpg`,
  name: `${id}.jpg`,
  extension: "jpg",
  kind: "photo",
  size: 100,
  width: 100,
  height: 100,
  modifiedAt: new Date("2024-01-01").toISOString(),
  createdAt: new Date("2024-01-01").toISOString(),
  favorite: false,
  hidden: false,
  tags: [],
  ...over,
});
useLibraryStore.setState({
  items: [mk("a"), mk("b"), mk("c")],
  selectedIds: [],
  inspectedId: null,
});
useLibraryStore.getState().refreshDerived();

console.log("\nlibrary selection");
useLibraryStore.getState().toggleSelectAll();
check("toggleSelectAll selects all visible", useLibraryStore.getState().selectedIds.length === 3,
  JSON.stringify(useLibraryStore.getState().selectedIds));
check("toggleSelectAll leaves inspection untouched", useLibraryStore.getState().inspectedId === null,
  String(useLibraryStore.getState().inspectedId));
useLibraryStore.getState().toggleSelectAll();
check("toggleSelectAll deselects all", useLibraryStore.getState().selectedIds.length === 0);

useLibraryStore.getState().addToSelection("a");
useLibraryStore.getState().addToSelection("b");
check("addToSelection accumulates", useLibraryStore.getState().selectedIds.join(",") === "a,b",
  useLibraryStore.getState().selectedIds.join(","));
useLibraryStore.getState().addToSelection("a");
check("addToSelection is idempotent (no toggle-off)",
  useLibraryStore.getState().selectedIds.join(",") === "a,b",
  useLibraryStore.getState().selectedIds.join(","));

console.log("\ninspection vs selection independence");
useLibraryStore.getState().toggleSelection("b");
check("toggleSelection removes membership", useLibraryStore.getState().selectedIds.join(",") === "a",
  useLibraryStore.getState().selectedIds.join(","));
useLibraryStore.getState().toggleSelection("c");
check("toggleSelection adds membership", useLibraryStore.getState().selectedIds.join(",") === "a,c",
  useLibraryStore.getState().selectedIds.join(","));
// Multi-selection present: inspecting must NOT rewrite the selection,
// and clearing the selection must NOT move inspection.
let st;
useLibraryStore.getState().inspectItem("a");
st = useLibraryStore.getState();
check("inspectItem sets inspection focus", st.inspectedId === "a", String(st.inspectedId));
check("inspectItem leaves multi-selection intact", st.selectedIds.join(",") === "a,c",
  st.selectedIds.join(","));
check("an already-selected item can be inspected", st.selectedIds.includes(st.inspectedId));
useLibraryStore.getState().inspectItem("b");
st = useLibraryStore.getState();
check("a non-selected item can be inspected too",
  st.inspectedId === "b" && st.selectedIds.join(",") === "a,c",
  `${st.inspectedId} / ${st.selectedIds.join(",")}`);
useLibraryStore.getState().inspectItem("c");
check("inspection can move between selected items",
  useLibraryStore.getState().inspectedId === "c" &&
  useLibraryStore.getState().selectedIds.join(",") === "a,c");
useLibraryStore.getState().clearSelection();
st = useLibraryStore.getState();
check("clearSelection empties selectedIds", st.selectedIds.length === 0);
check("clearSelection preserves inspection", st.inspectedId === "c", String(st.inspectedId));
useLibraryStore.getState().toggleSelection("a");
useLibraryStore.getState().toggleSelection("b");
check("selection ops never move inspection",
  useLibraryStore.getState().inspectedId === "c",
  String(useLibraryStore.getState().inspectedId));
useLibraryStore.getState().clearSelection();
check("clearSelection empties selectedIds (recheck)", useLibraryStore.getState().selectedIds.length === 0);

console.log("\nbatch actions");
await useLibraryStore.getState().setFavoriteForIds(["a", "b"], true);
st = useLibraryStore.getState();
check("setFavoriteForIds marks both favorite", st.items.filter((i) => i.favorite).length === 2);
check("setFavoriteForIds hit the backend twice",
  __calls.filter((c) => c[0] === "favorite").length === 2,
  JSON.stringify(__calls.filter((c) => c[0] === "favorite")));

await useLibraryStore.getState().setHiddenForIds(["a", "c"], true);
st = useLibraryStore.getState();
check("setHiddenForIds hides both", st.items.filter((i) => i.hidden).length === 2);
check("hiddenCount reflects hidden items", st.hiddenCount === 2, String(st.hiddenCount));

await useLibraryStore.getState().setFavoriteForIds(["a", "b"], false);
st = useLibraryStore.getState();
check("setFavoriteForIds can un-favorite", st.items.filter((i) => i.favorite).length === 0);

console.log("\nviewer transforms");
useViewerStore.getState().resetTransform();
check("rotation starts at 0", useViewerStore.getState().rotation === 0);
useViewerStore.getState().rotate(90);
check("rotate(90) -> 90", useViewerStore.getState().rotation === 90);
for (let i = 0; i < 3; i++) useViewerStore.getState().rotate(90);
check("rotate wraps 360 -> 0", useViewerStore.getState().rotation === 0, String(useViewerStore.getState().rotation));
useViewerStore.getState().rotate(-90);
check("rotate(-90) wraps to 270", useViewerStore.getState().rotation === 270, String(useViewerStore.getState().rotation));
useViewerStore.getState().toggleFlip();
check("toggleFlip sets flipX", useViewerStore.getState().flipX === true);
useViewerStore.getState().resetTransform();
check("resetTransform clears rotation+flip",
  useViewerStore.getState().rotation === 0 && useViewerStore.getState().flipX === false);

useViewerStore.getState().rotate(90);
useViewerStore.getState().navigate(1);
check("navigate resets the transform for the next photo",
  useViewerStore.getState().rotation === 0 && useViewerStore.getState().flipX === false);

rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} smoke check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
