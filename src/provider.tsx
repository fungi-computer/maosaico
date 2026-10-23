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
/** A mounted pane's stable identity and initial geometry. */
export type MaosaicoItem = {
  /** Identity used for registration and commands. */
  id: string;
  /** Initial floating frame; later changes use layout commands. */
  frame: Frame;
  /** Minimum dimensions kept current while the pane is mounted. */
  minima: Minima;
};
/** Interaction mode and layout participation for a mounted pane. */
export type MaosaicoItemOptions = {
  /** Defaults to dragging; resize changes dimensions instead of origin. */
  kind?: "drag" | "resize";
  /** Defaults to true; false retains geometry but excludes the pane from layout. */
  participating?: boolean;
};
/** Geometry, focus state and host element interactions for a pane. */
export type MaosaicoItemBinding = {
  /** Visible layout frame, falling back to the pane's floating geometry. */
  frame: Frame;
  /** Merge into the window's style, inside the windows layer. */
  stackingStyle: Pick<React.CSSProperties, "zIndex">;
  /** Whether this pane has a frame in the current arrangement. */
  visible: boolean;
  /** Whether this pane is last in focus order. */
  active: boolean;
  /** Pointer attributes to spread onto the pane's interaction element. */
  props: React.DOMAttributes<HTMLElement>;
  /** Bring the pane to the top of focus order. */
  focus: () => void;
  /** Snap the pane to a container edge or corner. */
  snap: (side: SnapSide) => void;
  /** Restore the pane's retained floating frame. */
  restore: () => void;
};

/** Omit tiling to retain floating frames. Main size is a preference, in pixels. */
export function MaosaicoRoot({
  bounds,
  tiling,
  containerRef,
  children,
}: {
  /** Available container dimensions in host coordinates. */
  bounds: Bounds;
  /** Optional tiling strategy; omission preserves floating frames. */
  tiling?: TilingOptions | undefined;
  /** The positioned workspace element; supplying it enables container-relative edge snapping. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Host-owned content rendered inside the layout context. */
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
    stackingStyle: {
      /** Rank above every pane in the windows region. */
      zIndex: state.order.length,
    },
    /** Whether the root supplied a tiling strategy. */
    mode: tiled ? ("tiled" as const) : ("floating" as const),
    /** Stable order of participating tiles. */
    order,
    /** Whether a frame or divider gesture is active. */
    interacting: state.gesture !== null,
    /** Candidate floating-frame snap, hidden while tiled or zoomed. */
    snapPreview:
      !tiled && !state.zoomed && state.gesture?.kind === "frame"
        ? (state.gesture.snap ?? null)
        : null,
    /** Most recently focused participating pane, or null. */
    activeId: state.order.at(-1) ?? null,
    /** Pane expanded to fill the root, or null. */
    zoomedId: state.zoomed,
    /** Overflow panes sharing layout slots. */
    tabGroups: arrangement.tabGroups,
    /** Divider geometry and pointer attributes, or null. */
    divider: divider && {
      ...divider,
      /** Captured-pointer attributes for resizing the main pane. */
      props: dividerProps,
    },
    /** Focus a registered pane. */
    focus: state.focus,
    /** Swap two participating panes in tiling order. */
    swap: state.swap,
    /** Expand a pane or clear expansion with null. */
    zoom: state.zoom,
    /** Set the main-pane extent within current divider bounds. */
    resizeMain: (size: number) => {
      if (divider)
        state.resizeMain(Math.min(divider.max, Math.max(divider.min, size)));
    },
  };
}

/** Register a mounted pane and bind its geometry and captured-pointer lifecycle. */
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
