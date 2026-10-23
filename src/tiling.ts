import type { Bounds, Frame, Minima } from "./layout.js";

/** Named strategies for dividing the host's available bounds. */
export type TilingLayout =
  "main-left" | "main-top" | "columns" | "rows" | "grid";

/** Layout strategy and spacing supplied by the host. */
export type TilingOptions = {
  /** Defaults to main-left. */
  layout?: TilingLayout;
  /** Preferred main-pane extent; defaults to half the container's extent. */
  mainSize?: number;
  /** Space between panes; defaults to eight coordinate units. */
  gap?: number;
};
/** Clamped divider geometry for a main-pane layout. */
export type Divider = {
  /** Coordinate axis along which the divider moves. */
  axis: "x" | "y";
  /** Current main-pane extent. */
  position: number;
  /** Smallest extent permitted by pane minima. */
  min: number;
  /** Largest extent permitted by pane minima and available bounds. */
  max: number;
};
/** Pane frames, overflow tabs and optional main-pane divider. */
export type Arrangement = {
  /** Visible pane geometry, keyed by identity. */
  frames: Map<string, Frame>;
  /** Panes sharing an overflow slot; the host renders their tabs. */
  tabGroups: string[][];
  /** Main-pane divider, absent for equal layouts or insufficient space. */
  divider: Divider | null;
};

/** Named layouts share minima and MRU tabs; the caller renders the groups. */
export function arrangeTiles(
  order: readonly string[],
  minima: ReadonlyMap<string, Minima>,
  recent: readonly string[],
  bounds: Bounds,
  options: TilingOptions,
): Arrangement {
  const layout = options.layout ?? "main-left";
  if (layout === "columns" || layout === "rows" || layout === "grid")
    return arrangeEqual(order, minima, recent, bounds, options, layout);
  if (layout === "main-top") {
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

function arrangeEqual(
  order: readonly string[],
  minima: ReadonlyMap<string, Minima>,
  recent: readonly string[],
  bounds: Bounds,
  options: TilingOptions,
  layout: "columns" | "rows" | "grid",
): Arrangement {
  const frames = new Map<string, Frame>();
  const tabGroups: string[][] = [];
  if (!order.length) return { frames, tabGroups, divider: null };
  const gap = Math.max(0, options.gap ?? 8);
  const minimum = order.reduce(
    (size, id) => ({
      width: Math.max(size.width, minima.get(id)?.width ?? 0),
      height: Math.max(size.height, minima.get(id)?.height ?? 0),
    }),
    { width: 0, height: 0 },
  );
  // Capacity is bounded by the live tile count, including zero-minimum panes.
  const capacity = (available: number, min: number) =>
    min + gap === 0
      ? order.length
      : Math.min(
          order.length,
          Math.max(1, Math.floor((available + gap) / (min + gap))),
        );
  const maxColumns = capacity(bounds.width, minimum.width);
  const maxRows = capacity(bounds.height, minimum.height);
  const slots =
    minimum.width > bounds.width || minimum.height > bounds.height
      ? 1
      : layout === "columns"
        ? maxColumns
        : layout === "rows"
          ? maxRows
          : Math.min(order.length, maxColumns * maxRows);
  const columns =
    layout === "columns"
      ? slots
      : layout === "rows"
        ? 1
        : Math.min(
            maxColumns,
            Math.max(Math.ceil(Math.sqrt(slots)), Math.ceil(slots / maxRows)),
          );
  const rows = Math.ceil(slots / columns);
  const width = (bounds.width - gap * (columns - 1)) / columns;
  const height = (bounds.height - gap * (rows - 1)) / rows;
  // Keep the leading tiles in place; overflow shares the final cell.
  for (let index = 0; index < slots; index++) {
    const ids = order.slice(index, index === slots - 1 ? undefined : index + 1);
    const selected =
      ids.length === 1
        ? ids[0]
        : ([...recent].reverse().find((id) => ids.includes(id)) ?? ids[0]);
    if (selected)
      frames.set(selected, {
        x: (index % columns) * (width + gap),
        y: Math.floor(index / columns) * (height + gap),
        width,
        height,
      });
    if (ids.length > 1) tabGroups.push(ids);
  }
  return { frames, tabGroups, divider: null };
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
