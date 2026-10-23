/// <reference lib="es2023" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="esnext.disposable" />
import * as entry0 from "@fungi.computer/maosaico";
export { entry0 };
import * as entry1 from "@fungi.computer/maosaico/headless";
export { entry1 };

// The documented headless projections are importable by an external consumer.
export type LayoutState = entry1.State;
export type LayoutGesture = entry1.Gesture;
export type LayoutSnapSide = entry1.SnapSide;
export type LayoutDivider = entry1.Divider;

const layout: entry0.TilingLayout = "grid";
const options: entry1.TilingOptions = { layout, gap: 0 };
export const grid = entry1.arrangeTiles(
  ["one", "two", "three", "four"],
  new Map(),
  [],
  { width: 160, height: 48 },
  options,
);
