import { atom, createStore } from "jotai/vanilla";

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Frame = Point & Size;
export type Bounds = Size;
export type Minima = Size;
export type SnapSide =
  "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type Gesture =
  | {
      kind: "frame";
      id: string;
      pointerId: number;
      start: Frame;
      snap?: { side: SnapSide; frame: Frame } | null;
    }
  | { kind: "divider"; pointerId: number; start: number | undefined };
export type State = {
  frames: Map<string, Frame>;
  order: string[];
  tiles: string[];
  minima: Map<string, Minima>;
  participating: Set<string>;
  mainSize: number | undefined;
  zoomed: string | null;
  gesture: Gesture | null;
  restore: Map<string, Frame>;
};
const stateAtom = atom<State>({
  frames: new Map(),
  order: [],
  tiles: [],
  minima: new Map(),
  participating: new Set<string>(),
  mainSize: undefined,
  zoomed: null,
  gesture: null,
  restore: new Map(),
});
const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);
export const clampFrame = (
  frame: Frame,
  bounds: Bounds,
  minima: Minima,
): Frame => {
  const width = clamp(
    frame.width,
    minima.width,
    Math.max(minima.width, bounds.width),
  );
  const height = clamp(
    frame.height,
    minima.height,
    Math.max(minima.height, bounds.height),
  );
  return {
    width,
    height,
    x: clamp(frame.x, 0, Math.max(0, bounds.width - width)),
    y: clamp(frame.y, 0, Math.max(0, bounds.height - height)),
  };
};
const snapFrame = (side: SnapSide, bounds: Bounds, minima: Minima): Frame => {
  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;
  const frame =
    side === "left"
      ? { x: 0, y: 0, width: halfWidth, height: bounds.height }
      : side === "right"
        ? { x: halfWidth, y: 0, width: halfWidth, height: bounds.height }
        : side === "top-left"
          ? { x: 0, y: 0, width: halfWidth, height: halfHeight }
          : side === "top-right"
            ? { x: halfWidth, y: 0, width: halfWidth, height: halfHeight }
            : side === "bottom-left"
              ? { x: 0, y: halfHeight, width: halfWidth, height: halfHeight }
              : {
                  x: halfWidth,
                  y: halfHeight,
                  width: halfWidth,
                  height: halfHeight,
                };
  return clampFrame(frame, bounds, minima);
};
export type MaosaicoState = Readonly<State> & {
  readonly version: number;
  subscribe: (listener: () => void) => () => void;
  register: (id: string, frame: Frame, minima: Minima) => void;
  setParticipation: (id: string, participating: boolean) => void;
  setMinima: (id: string, minima: Minima) => void;
  unregister: (id: string) => void;
  begin: (id: string, pointerId: number) => void;
  move: (
    id: string,
    pointerId: number,
    frame: Frame,
    bounds: Bounds,
    minima: Minima,
    snapSide?: SnapSide | null,
  ) => void;
  end: (id: string, pointerId: number) => void;
  cancel: (id: string, pointerId: number) => void;
  snap: (id: string, side: SnapSide, bounds: Bounds, minima: Minima) => void;
  restoreFrame: (id: string, bounds: Bounds, minima: Minima) => void;
  focus: (id: string) => void;
  swap: (first: string, second: string) => void;
  zoom: (id: string | null) => void;
  resizeMain: (size: number) => void;
  beginDivider: (pointerId: number) => boolean;
  finishDivider: (pointerId: number, cancel: boolean) => void;
  destroy: () => void;
};
export const createMaosaicoState = (): MaosaicoState => {
  const store = createStore();
  const read = () => store.get(stateAtom);
  let version = 0;
  const update = (change: (state: State) => State) => {
    version += 1;
    store.set(stateAtom, change(read()));
  };
  const touch = (id: string, frame: Frame, minima: Minima) => {
    update((state) => {
      const frames = new Map(state.frames);
      frames.set(id, frame);
      return {
        ...state,
        frames,
        participating: new Set(state.participating).add(id),
        tiles: state.tiles.includes(id) ? state.tiles : [...state.tiles, id],
        minima: new Map(state.minima).set(id, minima),
        order: state.order.includes(id)
          ? state.order
          : [
              ...state.order.filter((value) => value !== state.zoomed),
              id,
              ...(state.zoomed ? [state.zoomed] : []),
            ],
      };
    });
  };
  const registered = (id: string) => read().frames.has(id);
  const ownsFrame = (id: string, pointerId: number) => {
    const gesture = read().gesture;
    return (
      gesture?.kind === "frame" &&
      gesture.id === id &&
      gesture.pointerId === pointerId
    );
  };
  return {
    get version() {
      return version;
    },
    get frames() {
      return read().frames;
    },
    get order() {
      return read().order;
    },
    get tiles() {
      return read().tiles;
    },
    get minima() {
      return read().minima;
    },
    get participating() {
      return read().participating;
    },
    get mainSize() {
      return read().mainSize;
    },
    get zoomed() {
      return read().zoomed;
    },
    get gesture() {
      return read().gesture;
    },
    get restore() {
      return read().restore;
    },
    subscribe: (listener) => store.sub(stateAtom, listener),
    register: touch,
    setParticipation: (id, participating) => {
      if (!read().frames.has(id)) return;
      update((state) => {
        const current = state.participating.has(id);
        if (current === participating) return state;
        const participants = new Set(state.participating);
        if (participating) participants.add(id);
        else participants.delete(id);
        const tiles = participating
          ? state.tiles.includes(id)
            ? state.tiles
            : [...state.tiles, id]
          : state.tiles.filter((value) => value !== id);
        const order = participating
          ? state.order.includes(id)
            ? state.order
            : [...state.order, id]
          : state.order.filter((value) => value !== id);
        return {
          ...state,
          participating: participants,
          tiles,
          order,
          zoomed: participating || state.zoomed !== id ? state.zoomed : null,
          gesture:
            !participating &&
            state.gesture?.kind === "frame" &&
            state.gesture.id === id
              ? null
              : state.gesture,
        };
      });
    },
    setMinima: (id, minima) => {
      const previous = read().minima.get(id);
      if (
        !previous ||
        (previous.width === minima.width && previous.height === minima.height)
      )
        return;
      update((state) => ({
        ...state,
        minima: new Map(state.minima).set(id, minima),
      }));
    },
    unregister: (id) => {
      update((state) => {
        if (!state.frames.has(id)) return state;
        const frames = new Map(state.frames);
        frames.delete(id);
        const restore = new Map(state.restore);
        restore.delete(id);
        const order = state.order.filter((value) => value !== id);
        const tiles = state.tiles.filter((value) => value !== id);
        const minima = new Map(state.minima);
        minima.delete(id);
        const participating = new Set(state.participating);
        participating.delete(id);
        const gesture =
          state.gesture?.kind === "frame" && state.gesture.id === id
            ? null
            : state.gesture;
        return {
          ...state,
          frames,
          restore,
          order,
          tiles,
          minima,
          participating,
          gesture,
          zoomed: state.zoomed === id ? null : state.zoomed,
        };
      });
    },
    begin: (id, pointerId) => {
      if (!registered(id) || !read().participating.has(id)) return;
      update((state) => ({
        ...state,
        gesture: {
          kind: "frame",
          id,
          pointerId,
          start: state.frames.get(id) ?? { x: 0, y: 0, width: 0, height: 0 },
        },
        order: [...state.order.filter((value) => value !== id), id],
      }));
    },
    move: (id, pointerId, frame, bounds, minima, snapSide = null) => {
      if (
        registered(id) &&
        read().participating.has(id) &&
        ownsFrame(id, pointerId)
      ) {
        update((state) => ({
          ...state,
          frames: new Map(state.frames).set(
            id,
            clampFrame(frame, bounds, minima),
          ),
          gesture:
            state.gesture?.kind === "frame"
              ? {
                  ...state.gesture,
                  snap: snapSide
                    ? {
                        side: snapSide,
                        frame: snapFrame(snapSide, bounds, minima),
                      }
                    : null,
                }
              : state.gesture,
        }));
      }
    },
    end: (id, pointerId) => {
      if (ownsFrame(id, pointerId))
        update((state) => {
          const gesture = state.gesture;
          if (gesture?.kind !== "frame" || !gesture.snap)
            return { ...state, gesture: null };
          return {
            ...state,
            frames: new Map(state.frames).set(id, gesture.snap.frame),
            restore: new Map(state.restore).set(
              id,
              state.restore.get(id) ?? gesture.start,
            ),
            gesture: null,
          };
        });
    },
    cancel: (id, pointerId) => {
      const gesture = read().gesture;
      if (
        gesture?.kind === "frame" &&
        gesture.id === id &&
        gesture.pointerId === pointerId
      )
        update((state) => {
          const frames = new Map(state.frames);
          frames.set(id, gesture.start);
          return { ...state, frames, gesture: null };
        });
    },
    snap: (id, side, bounds, minima) => {
      if (!registered(id) || !read().participating.has(id)) return;
      update((state) => {
        const restore = new Map(state.restore);
        restore.set(
          id,
          state.frames.get(id) ?? snapFrame(side, bounds, minima),
        );
        const frames = new Map(state.frames);
        frames.set(id, snapFrame(side, bounds, minima));
        return {
          ...state,
          frames,
          restore,
          order: [...state.order.filter((value) => value !== id), id],
        };
      });
    },
    restoreFrame: (id, bounds, minima) => {
      if (!registered(id) || !read().participating.has(id)) return;
      update((state) => {
        const frame = state.restore.get(id);
        if (!frame) return state;
        const frames = new Map(state.frames);
        frames.set(id, clampFrame(frame, bounds, minima));
        const restore = new Map(state.restore);
        restore.delete(id);
        return { ...state, frames, restore };
      });
    },
    focus: (id) => {
      if (!registered(id)) return;
      update((state) => ({
        ...state,
        order: [...state.order.filter((value) => value !== id), id],
        zoomed: state.zoomed === null ? null : id,
      }));
    },
    swap: (first, second) => {
      if (
        !registered(first) ||
        !registered(second) ||
        !read().participating.has(first) ||
        !read().participating.has(second)
      )
        return;
      update((state) => ({
        ...state,
        tiles: state.tiles.map((id) =>
          id === first ? second : id === second ? first : id,
        ),
      }));
    },
    zoom: (id) => {
      if (id !== null && (!registered(id) || !read().participating.has(id)))
        return;
      update((state) => ({
        ...state,
        zoomed: id,
        order:
          id === null
            ? state.order
            : [...state.order.filter((value) => value !== id), id],
      }));
    },
    resizeMain: (size) => {
      update((state) => ({ ...state, mainSize: size }));
    },
    beginDivider: (pointerId) => {
      if (read().gesture) return false;
      update((state) => ({
        ...state,
        gesture: { kind: "divider", pointerId, start: state.mainSize },
      }));
      return true;
    },
    finishDivider: (pointerId, cancel) => {
      const gesture = read().gesture;
      if (gesture?.kind !== "divider" || gesture.pointerId !== pointerId)
        return;
      update((state) => ({
        ...state,
        gesture: null,
        mainSize: cancel ? gesture.start : state.mainSize,
      }));
    },
    destroy: () => {
      update((state) => ({ ...state, gesture: null, restore: new Map() }));
    },
  };
};
