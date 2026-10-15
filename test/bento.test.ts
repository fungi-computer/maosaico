import { describe, expect, it } from "vitest";
import type { BentoColumns } from "../src/index.js";
import { applyBentoOps, arrangeBento, bentoFrames } from "../src/index.js";

describe("Maosaico bento arrangement", () => {
  it("moves a chosen tile into a cell and pushes the occupant down without mutating the input", () => {
    const placements = [
      { id: "inbox", col: 0, row: 0, w: 2, h: 2 },
      { id: "launcher", col: 2, row: 0, w: 2, h: 1 },
    ];
    expect(
      applyBentoOps(
        placements,
        [{ kind: "move", id: "launcher", col: 0, row: 0 }],
        4,
      ),
    ).toEqual([
      { id: "inbox", col: 0, row: 1, w: 2, h: 2 },
      { id: "launcher", col: 0, row: 0, w: 2, h: 1 },
    ]);
    expect(placements[0]?.row).toBe(0);
  });
  it("clamps and reflows 4 to 2 to 1 columns without storing a breakpoint-specific layout", () => {
    const original = [
      { id: "inbox", col: 0, row: 0, w: 2, h: 2 },
      { id: "launcher", col: 2, row: 0, w: 2, h: 1 },
    ];
    expect(arrangeBento(original, 4)).toEqual(original);
    expect(arrangeBento(original, 2)).toEqual([
      { id: "inbox", col: 0, row: 0, w: 2, h: 2 },
      { id: "launcher", col: 0, row: 2, w: 2, h: 1 },
    ]);
    expect(arrangeBento(original, 1)).toEqual([
      { id: "inbox", col: 0, row: 0, w: 1, h: 2 },
      { id: "launcher", col: 0, row: 2, w: 1, h: 1 },
    ]);
    expect(arrangeBento(original, 4)).toEqual(original);
  });

  it("compacts large gaps and maps spans onto container-relative frames", () => {
    const placements = [
      { id: "a", col: 0, row: 10_000_000, w: 2, h: 2 },
      { id: "b", col: 2, row: 10_000_001, w: 2, h: 1 },
    ];
    expect(arrangeBento(placements, 4).map((item) => item.row)).toEqual([0, 0]);
    expect([
      ...bentoFrames(arrangeBento(placements, 4), {
        columns: 4,
        width: 408,
        rowHeight: 120,
        gap: 8,
      }),
    ]).toEqual([
      ["a", { x: 0, y: 0, width: 200, height: 248 }],
      ["b", { x: 208, y: 0, width: 200, height: 120 }],
    ]);
  });

  it("clamps a resize to the grid and displaces intersecting tiles", () => {
    expect(
      applyBentoOps(
        [
          { id: "a", col: 0, row: 0, w: 2, h: 2 },
          { id: "b", col: 2, row: 0, w: 2, h: 1 },
        ],
        [{ kind: "resize", id: "a", w: 9, h: 2 }],
        4,
      ),
    ).toEqual([
      { id: "a", col: 0, row: 0, w: 4, h: 2 },
      { id: "b", col: 2, row: 2, w: 2, h: 1 },
    ]);
  });
});

it("moves down past a neighbour while compacting that neighbour into the old cell", () => {
  expect(
    applyBentoOps(
      [
        { id: "a", col: 0, row: 0, w: 1, h: 1 },
        { id: "b", col: 0, row: 1, w: 1, h: 1 },
      ],
      [{ kind: "move", id: "a", col: 0, row: 1 }],
      1,
    ),
  ).toEqual([
    { id: "a", col: 0, row: 1, w: 1, h: 1 },
    { id: "b", col: 0, row: 0, w: 1, h: 1 },
  ]);
});

it.each([NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects nonrepresentable cell measurements %s",
  (value) => {
    for (const field of ["col", "row", "w", "h"]) {
      expect(() =>
        arrangeBento(
          [{ id: "a", col: 0, row: 0, w: 1, h: 1, [field]: value }],
          4,
        ),
      ).toThrow(RangeError);
    }
  },
);
it("rejects duplicate IDs and extents beyond safe integer cells", () => {
  const tile = { id: "a", col: 0, row: 0, w: 1, h: 1 };
  expect(() => arrangeBento([tile, tile], 4)).toThrow(
    "Bento IDs must be unique",
  );
  expect(() =>
    arrangeBento([{ ...tile, row: Number.MAX_SAFE_INTEGER }], 4),
  ).toThrow(RangeError);
});

it("moves down past a taller neighbour without leaving a hole", () => {
  const source = [
    { id: "a", col: 0, row: 0, w: 2, h: 1 },
    { id: "b", col: 0, row: 1, w: 2, h: 3 },
  ];
  expect(
    applyBentoOps(source, [{ kind: "move", id: "a", col: 0, row: 1 }], 2),
  ).toEqual([
    { id: "a", col: 0, row: 3, w: 2, h: 1 },
    { id: "b", col: 0, row: 0, w: 2, h: 3 },
  ]);
});
it("compacts a four-column Launcher downward proposal instead of storing an empty cell", () => {
  const source = [
    { id: "launcher", col: 0, row: 0, w: 2, h: 1 },
    { id: "inbox", col: 2, row: 0, w: 2, h: 2 },
  ];
  expect(
    applyBentoOps(
      source,
      [{ kind: "move", id: "launcher", col: 0, row: 1 }],
      4,
    ),
  ).toEqual(source);
});
it("keeps every move and resize result at a compaction fixpoint", () => {
  const grids: BentoColumns[] = [1, 2, 4];
  for (const columns of grids) {
    for (const height of [1, 3]) {
      const source = [
        { id: "a", col: 0, row: 0, w: 2, h: 1 },
        { id: "b", col: 0, row: 1, w: 2, h: height },
        { id: "c", col: 2, row: 0, w: 2, h: 2 },
      ];
      for (const id of ["a", "b", "c"]) {
        for (const row of [0, 1, 5]) {
          const moved = applyBentoOps(
            source,
            [{ kind: "move", id, col: 0, row }],
            columns,
          );
          expect(arrangeBento(moved, columns)).toEqual(moved);
          const resized = applyBentoOps(
            moved,
            [{ kind: "resize", id, w: 2, h: height + 1 }],
            columns,
          );
          expect(arrangeBento(resized, columns)).toEqual(resized);
        }
      }
    }
  }
});
it.each([NaN, -1])("rejects invalid pixel geometry %s", (value) => {
  for (const field of ["width", "rowHeight", "gap"]) {
    expect(() =>
      bentoFrames([{ id: "a", col: 0, row: 0, w: 1, h: 1 }], {
        columns: 4,
        width: 408,
        rowHeight: 120,
        gap: 8,
        [field]: value,
      }),
    ).toThrow(RangeError);
  }
});

it.each([
  { id: "a", rows: [1, 0, 2, 3] },
  { id: "b", rows: [0, 2, 1, 3] },
])("moves $id down exactly one place in a four-tile stack", ({ id, rows }) => {
  const source = ["a", "b", "c", "d"].map((id, row) => ({
    id,
    col: 0,
    row,
    w: 1,
    h: 1,
  }));
  expect(
    applyBentoOps(
      source,
      [{ kind: "move", id, col: 0, row: id === "a" ? 1 : 2 }],
      1,
    ).map((item) => item.row),
  ).toEqual(rows);
});

it("compacts a drop below the last tile back to the same stack without jumping to the top", () => {
  const source = ["a", "b", "c", "d"].map((id, row) => ({
    id,
    col: 0,
    row,
    w: 1,
    h: 1,
  }));
  expect(
    applyBentoOps(source, [{ kind: "move", id: "d", col: 0, row: 6 }], 1),
  ).toEqual(source);
});

it.each([1, 2])(
  "swaps equal-sized tiles when a horizontal move to column %s enters the occupied tile",
  (col) => {
    const source = [
      { id: "a", col: 0, row: 0, w: 2, h: 1 },
      { id: "b", col: 2, row: 0, w: 2, h: 1 },
    ];
    expect(
      applyBentoOps(source, [{ kind: "move", id: "a", col, row: 0 }], 4),
    ).toEqual([
      { id: "a", col: 2, row: 0, w: 2, h: 1 },
      { id: "b", col: 0, row: 0, w: 2, h: 1 },
    ]);
  },
);
it("pushes a different-sized horizontal occupant down, then removes vertical gaps", () => {
  const source = [
    { id: "a", col: 2, row: 0, w: 2, h: 1 },
    { id: "b", col: 0, row: 0, w: 2, h: 2 },
  ];
  const result = applyBentoOps(
    source,
    [{ kind: "move", id: "a", col: 0, row: 0 }],
    4,
  );
  expect(result).toEqual([
    { id: "a", col: 0, row: 0, w: 2, h: 1 },
    { id: "b", col: 0, row: 1, w: 2, h: 2 },
  ]);
  expect(arrangeBento(result, 4)).toEqual(result);
});

it("projects measured row heights without changing cells or uniform wide geometry", () => {
  const placements = [
    { id: "inbox", col: 0, row: 0, w: 2, h: 2 },
    { id: "launcher", col: 0, row: 2, w: 2, h: 1 },
  ];
  const geometry = { columns: 2, width: 390, rowHeight: 280, gap: 16 } as const;
  const frames = bentoFrames(placements, {
    ...geometry,
    rowHeights: [140, 160, 200],
  });
  expect(frames.get("inbox")).toEqual({ x: 0, y: 0, width: 390, height: 316 });
  expect(frames.get("launcher")).toEqual({
    x: 0,
    y: 332,
    width: 390,
    height: 200,
  });
  expect(bentoFrames(placements, geometry).get("inbox")?.height).toBe(576);
  expect(placements[1]?.row).toBe(2);
});
it.each([NaN, Infinity, -1])(
  "rejects invalid measured row height %s",
  (height) => {
    expect(() =>
      bentoFrames([{ id: "a", col: 0, row: 0, w: 1, h: 1 }], {
        columns: 1,
        width: 390,
        rowHeight: 280,
        gap: 16,
        rowHeights: [height],
      }),
    ).toThrow(RangeError);
  },
);
