import type { Bounds, Frame, Minima } from "./layout.js";

export type TilingOptions = {
  axis?: "x" | "y";
  mainSize?: number;
  gap?: number;
};
export type Divider = {
  axis: "x" | "y";
  position: number;
  min: number;
  max: number;
};
export type Arrangement = {
  frames: Map<string, Frame>;
  tabGroups: string[][];
  divider: Divider | null;
};

/** Main + companions. The caller renders tabs for groups that cannot fit. */
export function arrangeTiles(
  order: readonly string[],
  minima: ReadonlyMap<string, Minima>,
  recent: readonly string[],
  bounds: Bounds,
  options: TilingOptions,
): Arrangement {
  if (options.axis === "y") {
    const transverse = arrangeAlongX(
      order,
      new Map(
        [...minima].map(([id, size]) => [
          id,
          { width: size.height, height: size.width },
        ]),
      ),
      recent,
      { width: bounds.height, height: bounds.width },
      options,
    );
    return {
      frames: new Map(
        [...transverse.frames].map(([id, frame]) => [
          id,
          {
            x: frame.y,
            y: frame.x,
            width: frame.height,
            height: frame.width,
          },
        ]),
      ),
      tabGroups: transverse.tabGroups,
      divider: transverse.divider && {
        ...transverse.divider,
        axis: "y",
      },
    };
  }
  return arrangeAlongX(order, minima, recent, bounds, options);
}

function arrangeAlongX(
  order: readonly string[],
  minima: ReadonlyMap<string, Minima>,
  recent: readonly string[],
  bounds: Bounds,
  options: TilingOptions,
): Arrangement {
  const frames = new Map<string, Frame>();
  const tabGroups: string[][] = [];
  const whole = { x: 0, y: 0, ...bounds };
  const [main, ...companions] = order;
  const tabs = (ids: string[], frame: Frame) => {
    const selected =
      [...recent].reverse().find((id) => ids.includes(id)) ?? ids[0];
    if (selected) frames.set(selected, frame);
    if (ids.length > 1) tabGroups.push(ids);
  };
  if (!main) return { frames, tabGroups, divider: null };
  if (!companions.length) {
    frames.set(main, whole);
    return { frames, tabGroups, divider: null };
  }
  const gap = Math.max(0, options.gap ?? 8);
  const mainMin = minima.get(main)?.width ?? 0;
  const stackMin = Math.max(
    ...companions.map((id) => minima.get(id)?.width ?? 0),
  );
  const max = bounds.width - gap - stackMin;
  if (mainMin > max) {
    tabs([...order], whole);
    return { frames, tabGroups, divider: null };
  }
  const width = Math.min(
    max,
    Math.max(mainMin, options.mainSize ?? bounds.width / 2),
  );
  const divider: Divider = {
    axis: "x",
    position: width,
    min: mainMin,
    max,
  };
  frames.set(main, { ...whole, width });
  const stack = { ...whole, x: width + gap, width: bounds.width - width - gap };
  const heights = companions.map((id) => minima.get(id)?.height ?? 0);
  const required =
    heights.reduce((sum, height) => sum + height, 0) +
    gap * (companions.length - 1);
  if (required > bounds.height) {
    tabs(companions, stack);
  } else {
    const spare = (bounds.height - required) / companions.length;
    let y = 0;
    for (const id of companions) {
      const height = (minima.get(id)?.height ?? 0) + spare;
      frames.set(id, { ...stack, y, height });
      y += height + gap;
    }
  }
  return { frames, tabGroups, divider };
}
