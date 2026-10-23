import assert from "node:assert/strict";
import {
  createMaosaicoState,
  arrangeTiles,
} from "@fungi.computer/maosaico/headless";
const state = createMaosaicoState();
const grid = arrangeTiles(
  ["one", "two", "three", "four"],
  new Map(),
  [],
  { width: 160, height: 48 },
  { layout: "grid", gap: 0 },
);
assert.deepEqual(
  [...grid.frames.values()],
  [
    { x: 0, y: 0, width: 80, height: 24 },
    { x: 80, y: 0, width: 80, height: 24 },
    { x: 0, y: 24, width: 80, height: 24 },
    { x: 80, y: 24, width: 80, height: 24 },
  ],
);
assert.equal(grid.divider, null);
try {
  state.register(
    "note",
    { x: 0, y: 0, width: 300, height: 200 },
    { width: 100, height: 100 },
  );
  assert.equal(state.frames.get("note").width, 300);
  const arranged = arrangeTiles(
    ["note"],
    state.minima,
    ["note"],
    { width: 600, height: 400 },
    {},
  );
  assert.equal(arranged.frames.get("note").width, 600);
} finally {
  state.destroy();
}
