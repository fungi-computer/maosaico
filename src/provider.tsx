import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type React from "react";
import {
  createMaosaicoState,
  clampFrame,
  type Bounds,
  type Frame,
  type Minima,
  type MaosaicoState,
  type SnapSide,
} from "./layout.js";
import {
  arrangeTiles,
  type Arrangement,
  type TilingOptions,
} from "./tiling.js";
import { usePointerDrag } from "./pointer.js";
import { detectSnap } from "./snap.js";

const Context = createContext<{
  state: MaosaicoState;
  bounds: Bounds;
  tiled: boolean;
  arrangement: Arrangement;
  containerRef: React.RefObject<HTMLElement | null> | undefined;
} | null>(null);
export type MaosaicoItem = { id: string; frame: Frame; minima: Minima };
export type MaosaicoItemOptions = {
  kind?: "drag" | "resize";
  participating?: boolean;
};
export type MaosaicoItemBinding = {
  frame: Frame;
  /** Merge into the window's style, inside the windows layer. */
  stackingStyle: Pick<React.CSSProperties, "zIndex">;
  visible: boolean;
  active: boolean;
  props: React.DOMAttributes<HTMLElement>;
  focus: () => void;
  snap: (side: SnapSide) => void;
  restore: () => void;
};

/** Omit tiling to retain floating frames. Width is a preference, in pixels. */
export function MaosaicoRoot({
  bounds,
  tiling,
  containerRef,
  children,
}: {
  bounds: Bounds;
  tiling?: TilingOptions | undefined;
  /** The positioned workspace element; supplying it enables container-relative edge snapping. */
  containerRef?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
}) {
  const state = useMemo(createMaosaicoState, []);
  useSyncExternalStore(
    state.subscribe,
    () => state.version,
    () => state.version,
  );
  useEffect(
    () => () => {
      state.destroy();
    },
    [state],
  );
  const options: TilingOptions = { ...tiling };
  if (state.mainSize !== undefined) options.mainSize = state.mainSize;
  const arrangement = tiling
    ? arrangeTiles(state.tiles, state.minima, state.order, bounds, options)
    : {
        frames: new Map(
          [...state.frames]
            .filter(([id]) => state.participating.has(id))
            .map(([id, frame]) => [
              id,
              clampFrame(
                frame,
                bounds,
                state.minima.get(id) ?? { width: 0, height: 0 },
              ),
            ]),
        ),
        tabGroups: [],
        divider: null,
      };
  if (state.zoomed && state.participating.has(state.zoomed)) {
    arrangement.frames = new Map([[state.zoomed, { x: 0, y: 0, ...bounds }]]);
    arrangement.divider = null;
    arrangement.tabGroups = [];
  }
  return (
    <Context.Provider
      value={{
        state,
        bounds,
        tiled: tiling !== undefined,
        arrangement,
        containerRef,
      }}
    >
      {children}
    </Context.Provider>
  );
}

function useRoot() {
  const context = useContext(Context);
  if (!context)
    throw new Error("Maosaico hooks must be used within MaosaicoRoot");
  return context;
}

/** Layout commands keep content and DOM ownership with the caller. */
export function useMaosaicoLayout() {
  const { state, arrangement, tiled } = useRoot();
  const order: readonly string[] = state.tiles;
  const start = useRef({ pointer: 0, position: 0 });
  const divider = arrangement.divider;
  const dividerProps = usePointerDrag(
    {
      begin: (event) => {
        if (!divider || !state.beginDivider(event.pointerId)) return false;
        start.current = {
          pointer: event.pointerId,
          position: divider.position,
        };
        return true;
      },
      move: (dx, dy) => {
        if (!divider) return;
        start.current.position = Math.min(
          divider.max,
          Math.max(
            divider.min,
            start.current.position + (divider.axis === "x" ? dx : dy),
          ),
        );
        state.resizeMain(start.current.position);
      },
      end: (cancel) => {
        state.finishDivider(start.current.pointer, cancel);
      },
    },
    divider !== null,
  );
  return {
    /** Decorations rank immediately above every window, inside the windows region. */
    stackingStyle: { zIndex: state.order.length },
    mode: tiled ? ("tiled" as const) : ("floating" as const),
    order,
    interacting: state.gesture !== null,
    snapPreview:
      !tiled && !state.zoomed && state.gesture?.kind === "frame"
        ? (state.gesture.snap ?? null)
        : null,
    activeId: state.order.at(-1) ?? null,
    zoomedId: state.zoomed,
    tabGroups: arrangement.tabGroups,
    divider: divider && { ...divider, props: dividerProps },
    focus: state.focus,
    swap: state.swap,
    zoom: state.zoom,
    resizeMain: (size: number) => {
      if (divider)
        state.resizeMain(Math.min(divider.max, Math.max(divider.min, size)));
    },
  };
}

export function useMaosaicoItem(
  item: MaosaicoItem,
  options: MaosaicoItemOptions = {},
): MaosaicoItemBinding {
  const { state, bounds, tiled, arrangement, containerRef } = useRoot();
  // Frame seeds a mounted identity; later layout changes use commands, not remounts.
  useEffect(() => {
    state.register(item.id, item.frame, item.minima);
    return () => {
      state.unregister(item.id);
    };
  }, [state, item.id]);
  useEffect(() => {
    state.setMinima(item.id, item.minima);
  }, [state, item.id, item.minima.width, item.minima.height]);
  const participating = options.participating ?? true;
  useLayoutEffect(() => {
    state.setParticipation(item.id, participating);
  }, [state, item.id, participating]);
  const pointer = useRef(0);
  const props = usePointerDrag(
    {
      begin: (event) => {
        if (!state.frames.has(item.id) || state.gesture) return false;
        pointer.current = event.pointerId;
        state.begin(item.id, event.pointerId);
        return true;
      },
      move: (dx, dy, event) => {
        const container = containerRef?.current?.getBoundingClientRect();
        const side =
          container && options.kind !== "resize"
            ? detectSnap(
                {
                  x: event.clientX - container.left,
                  y: event.clientY - container.top,
                },
                bounds,
              )
            : null;
        const frame = clampFrame(
          state.frames.get(item.id) ?? item.frame,
          bounds,
          item.minima,
        );
        state.move(
          item.id,
          pointer.current,
          options.kind === "resize"
            ? { ...frame, width: frame.width + dx, height: frame.height + dy }
            : { ...frame, x: frame.x + dx, y: frame.y + dy },
          bounds,
          item.minima,
          side,
        );
      },
      end: (cancel) => {
        if (cancel) state.cancel(item.id, pointer.current);
        else state.end(item.id, pointer.current);
      },
    },
    participating && !tiled && !state.zoomed,
  );
  return {
    frame:
      arrangement.frames.get(item.id) ??
      state.frames.get(item.id) ??
      item.frame,
    stackingStyle: { zIndex: Math.max(0, state.order.indexOf(item.id)) },
    visible: arrangement.frames.has(item.id),
    active: participating && state.order.at(-1) === item.id,
    props,
    focus: () => {
      if (participating) state.focus(item.id);
    },
    snap: (side) => {
      if (participating && !tiled)
        state.snap(item.id, side, bounds, item.minima);
    },
    restore: () => {
      if (participating && !tiled)
        state.restoreFrame(item.id, bounds, item.minima);
    },
  };
}
