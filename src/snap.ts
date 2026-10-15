import type { Bounds, Point, SnapSide } from "./layout.js";

/** MaoMao v1.1.0 edge zones, measured in the owning container rather than viewport. */
export function detectSnap(point: Point, bounds: Bounds): SnapSide | null {
  const threshold = 20;
  if (point.x < threshold) {
    if (point.y < threshold) return "top-left";
    if (point.y > bounds.height - threshold) return "bottom-left";
    return "left";
  }
  if (point.x > bounds.width - threshold) {
    if (point.y < threshold) return "top-right";
    if (point.y > bounds.height - threshold) return "bottom-right";
    return "right";
  }
  return null;
}
