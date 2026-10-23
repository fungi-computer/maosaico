/** Layout state shared by browser and native hosts; renderers own containers. */
export { createMaosaicoState } from "./layout.js";
export type {
  MaosaicoState,
  State,
  Gesture,
  SnapSide,
  Frame,
  Bounds,
  Minima,
} from "./layout.js";
export { arrangeTiles } from "./tiling.js";
export type {
  Arrangement,
  Divider,
  TilingLayout,
  TilingOptions,
} from "./tiling.js";
