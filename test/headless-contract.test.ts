// @vitest-environment node
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { arrangeTiles, createMaosaicoState } from "../src/headless.js";

it("tiles four equal grid frames at 160×48 through the native headless entry", () => {
  const order = ["chat", "files", "preview", "terminal"];
  const arrangement = arrangeTiles(
    order,
    new Map(order.map((id) => [id, { width: 40, height: 12 }])),
    order,
    { width: 160, height: 48 },
    { layout: "grid", gap: 0 },
  );
  expect([...arrangement.frames]).toEqual([
    ["chat", { x: 0, y: 0, width: 80, height: 24 }],
    ["files", { x: 80, y: 0, width: 80, height: 24 }],
    ["preview", { x: 0, y: 24, width: 80, height: 24 }],
    ["terminal", { x: 80, y: 24, width: 80, height: 24 }],
  ]);
  expect(arrangement.tabGroups).toEqual([]);
  expect(arrangement.divider).toBeNull();
});

it("shares native layout, focus and zoom through the headless entry", () => {
  const state = createMaosaicoState();
  try {
    const bounds = { width: 160, height: 48 };
    const minima = { width: 32, height: 8 };
    state.register("alpha", { x: 0, y: 0, ...bounds }, minima);
    state.register("beta", { x: 0, y: 0, ...bounds }, minima);
    const arrangement = arrangeTiles(
      state.tiles,
      state.minima,
      state.order,
      bounds,
      { gap: 0 },
    );
    expect(arrangement.frames.get("alpha")?.width).toBe(80);
    expect(arrangement.frames.get("beta")?.width).toBe(80);
    state.focus("alpha");
    expect(state.order.at(-1)).toBe("alpha");
    state.zoom("beta");
    expect(state.zoomed).toBe("beta");
    state.unregister("beta");
    expect(state.zoomed).toBeNull();
    expect(state.tiles).toEqual(["alpha"]);
  } finally {
    state.destroy();
  }
});

it("clears the preferred main size through its owner without fixing a viewport size", () => {
  const state = createMaosaicoState();
  try {
    state.resizeMain(84);
    expect(state.mainSize).toBe(84);
    state.resizeMain(undefined);
    expect(state.mainSize).toBeUndefined();
  } finally {
    state.destroy();
  }
});

it("the native entry's runtime import graph stays independent of React and pointer renderers", async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL("../src/headless.ts", import.meta.url)),
    ],
    bundle: true,
    write: false,
    metafile: true,
    platform: "node",
    packages: "external",
  });
  const inputs = Object.keys(result.metafile.inputs);
  expect(
    inputs.some((path) => /\/(pointer|provider|index)\.tsx?$/u.test(path)),
  ).toBe(false);
  const imports = Object.values(result.metafile.inputs).flatMap(
    (input) => input.imports,
  );
  expect(
    imports.filter((entry) => /^(react|react-dom)(\/|$)/u.test(entry.path)),
  ).toEqual([]);
  expect(
    inputs.every((path) => /\/(headless|layout|tiling)\.ts$/u.test(path)),
  ).toBe(true);
});
