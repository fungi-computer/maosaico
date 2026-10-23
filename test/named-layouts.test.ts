// @vitest-environment node
import { expect, it } from "vitest";
import { arrangeTiles } from "../src/headless.js";

const order = ["chat", "files", "preview", "terminal"];
const minima = new Map(order.map((id) => [id, { width: 40, height: 12 }]));

it("makes columns equal rather than retaining a preferred main width", () => {
  const result = arrangeTiles(
    order,
    minima,
    order,
    { width: 160, height: 48 },
    {
      layout: "columns",
      mainSize: 120,
      gap: 0,
    },
  );
  expect([...result.frames.values()]).toEqual([
    { x: 0, y: 0, width: 40, height: 48 },
    { x: 40, y: 0, width: 40, height: 48 },
    { x: 80, y: 0, width: 40, height: 48 },
    { x: 120, y: 0, width: 40, height: 48 },
  ]);
  expect(result.divider).toBeNull();
  expect(result.tabGroups).toEqual([]);
});

it("makes rows equal rather than retaining a preferred main height", () => {
  const result = arrangeTiles(
    order,
    minima,
    order,
    { width: 160, height: 48 },
    {
      layout: "rows",
      mainSize: 36,
      gap: 0,
    },
  );
  expect([...result.frames.values()]).toEqual([
    { x: 0, y: 0, width: 160, height: 12 },
    { x: 0, y: 12, width: 160, height: 12 },
    { x: 0, y: 24, width: 160, height: 12 },
    { x: 0, y: 36, width: 160, height: 12 },
  ]);
  expect(result.divider).toBeNull();
  expect(result.tabGroups).toEqual([]);
});

it.each([
  { layout: "columns", bounds: { width: 100, height: 48 } },
  { layout: "rows", bounds: { width: 160, height: 28 } },
  { layout: "grid", bounds: { width: 80, height: 12 } },
] as const)(
  "$layout groups overflow in the last cell, selecting its most recent member",
  ({ layout, bounds }) => {
    const result = arrangeTiles(
      order,
      minima,
      ["terminal", "files", "chat", "preview"],
      bounds,
      { layout, gap: 0 },
    );
    expect([...result.frames.keys()]).toEqual(["chat", "preview"]);
    expect(result.tabGroups).toEqual([["files", "preview", "terminal"]]);
    for (const frame of result.frames.values()) {
      expect(frame.width).toBeGreaterThanOrEqual(40);
      expect(frame.height).toBeGreaterThanOrEqual(12);
      expect(frame.x + frame.width).toBeLessThanOrEqual(bounds.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(bounds.height);
    }
    const refocused = arrangeTiles(order, minima, ["files"], bounds, {
      layout,
      gap: 0,
    });
    expect([...refocused.frames.keys()]).toEqual(["chat", "files"]);
    expect(refocused.frames.get("files")).toEqual(result.frames.get("preview"));
  },
);

it("accounts for gaps and every group member's minima without consulting parked panes", () => {
  const result = arrangeTiles(
    order,
    new Map([...minima, ["parked", { width: 1000, height: 1000 }]]),
    order,
    { width: 168, height: 56 },
    { layout: "grid", gap: 8 },
  );
  expect([...result.frames.values()]).toEqual([
    { x: 0, y: 0, width: 80, height: 24 },
    { x: 88, y: 0, width: 80, height: 24 },
    { x: 0, y: 32, width: 80, height: 24 },
    { x: 88, y: 32, width: 80, height: 24 },
  ]);
});

it("uses the available aspect when a square grid cannot satisfy minima", () => {
  const result = arrangeTiles(
    order,
    minima,
    order,
    { width: 40, height: 48 },
    {
      layout: "grid",
      gap: 0,
    },
  );
  expect(result.frames.size).toBe(4);
  expect(
    [...result.frames.values()].map((frame) => [frame.width, frame.height]),
  ).toEqual([
    [40, 12],
    [40, 12],
    [40, 12],
    [40, 12],
  ]);
  expect(result.tabGroups).toEqual([]);
});

it.each(["columns", "rows", "grid"] as const)(
  "%s keeps one readable tab group when even one minimum exceeds the container",
  (layout) => {
    const result = arrangeTiles(
      order,
      minima,
      order,
      { width: 20, height: 8 },
      { layout, gap: 8 },
    );
    expect([...result.frames]).toEqual([
      ["terminal", { x: 0, y: 0, width: 20, height: 8 }],
    ]);
    expect(result.tabGroups).toEqual([order]);
  },
);

it.each(["main-left", "main-top", "columns", "rows", "grid"] as const)(
  "%s handles empty, single and zero-minimum workspaces without nonfinite frames",
  (layout) => {
    expect(
      arrangeTiles([], new Map(), [], { width: 0, height: 0 }, { layout })
        .frames.size,
    ).toBe(0);
    expect([
      ...arrangeTiles(
        ["chat"],
        minima,
        [],
        { width: 160, height: 48 },
        { layout },
      ).frames.values(),
    ]).toEqual([{ x: 0, y: 0, width: 160, height: 48 }]);
    const zero = arrangeTiles(
      order,
      new Map(),
      order,
      { width: 0, height: 0 },
      { layout, gap: 0 },
    );
    expect(
      [...zero.frames.values()].every((frame) =>
        Object.values(frame).every(Number.isFinite),
      ),
    ).toBe(true);
  },
);
