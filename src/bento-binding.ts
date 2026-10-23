import { useRef, useState } from "react";
import type { DOMAttributes } from "react";
import {
  applyBentoOps,
  resolveBento,
  bentoFrames,
  bentoRowAt,
  bentoRowOffset,
} from "./bento.js";
import type { BentoGeometry, BentoOp, BentoPlacement } from "./bento.js";
import { usePointerDrag } from "./pointer.js";

/** Host-owned placements and the callback receiving completed intents. */
export type BentoOptions = BentoGeometry & {
  /** Current committed tile positions and spans. */
  placements: readonly BentoPlacement[];
  /** Receive operations for a completed gesture or keyboard action. */
  onChange: (ops: readonly BentoOp[]) => void;
  /** Set false to disable pointer and keyboard edits. */
  enabled?: boolean;
};
/** Renderable frames and interaction attributes for host-owned tiles. */
export type BentoBinding = {
  /** Current committed or preview geometry. */
  frames: ReturnType<typeof bentoFrames>;
  /** Whether frames include a live, non-stale gesture preview. */
  preview: boolean;
  /** Tile being previewed, or null. */
  previewId: string | null;
  /** Bind a tile's move or resize interaction to a host element. */
  bind: (id: string, kind: "move" | "resize") => DOMAttributes<HTMLElement>;
};
type Gesture = {
  source: BentoOptions;
  item: BentoPlacement;
  kind: "move" | "resize";
  dx: number;
  dy: number;
  op: BentoOp | null;
};
function intent(
  item: BentoPlacement,
  kind: "move" | "resize",
  dx: number,
  dy: number,
): BentoOp {
  return kind === "move"
    ? { kind, id: item.id, col: item.col + dx, row: item.row + dy }
    : { kind, id: item.id, w: item.w + dx, h: item.h + dy };
}
function sameGeometry(a: BentoGeometry, b: BentoGeometry): boolean {
  return (
    a.columns === b.columns &&
    a.width === b.width &&
    a.rowHeight === b.rowHeight &&
    a.gap === b.gap &&
    (a.rowHeights?.length ?? 0) === (b.rowHeights?.length ?? 0) &&
    (a.rowHeights ?? []).every(
      (height, index) => height === b.rowHeights?.[index],
    )
  );
}

function samePlacements(
  a: readonly BentoPlacement[],
  b: readonly BentoPlacement[],
): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index];
      return (
        item.id === other?.id &&
        item.col === other.col &&
        item.row === other.row &&
        item.w === other.w &&
        item.h === other.h
      );
    })
  );
}

/** Captured, cell-snapped previews. Only a completed gesture proposes host-owned changes. */
export function useMaosaicoBento(options: BentoOptions): BentoBinding {
  const [cancellation, setCancellation] = useState(() => new AbortController());
  const latest = useRef(options);
  latest.current = options;
  const selected = useRef<{ id: string; kind: "move" | "resize" } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<readonly BentoPlacement[] | null>(
    null,
  );
  const current = gesture.current;
  const stale =
    current !== null &&
    (!samePlacements(current.source.placements, options.placements) ||
      !sameGeometry(current.source, options));
  const pointer = usePointerDrag(
    {
      begin: () => {
        const selection = selected.current;
        const source = latest.current;
        const item = resolveBento(source.placements, source.columns).find(
          (tile) => tile.id === selection?.id,
        );
        if (!selection || !item || source.width <= 0 || source.rowHeight <= 0)
          return false;
        gesture.current = {
          source,
          item,
          kind: selection.kind,
          dx: 0,
          dy: 0,
          op: null,
        };
        return true;
      },
      move: (dx, dy) => {
        const active = gesture.current;
        if (!active) return;
        active.dx += dx;
        active.dy += dy;
        const { columns, width, gap } = active.source;
        const anchor =
          active.item.row + (active.kind === "resize" ? active.item.h : 0);
        const stride = (width + gap) / columns;
        active.op = intent(
          active.item,
          active.kind,
          Math.round(active.dx / stride),
          bentoRowAt(
            bentoRowOffset(anchor, active.source) + active.dy,
            active.source,
          ) - anchor,
        );
        setPreview(
          applyBentoOps(active.source.placements, [active.op], columns),
        );
      },
      end: (cancel) => {
        const active = gesture.current;
        gesture.current = null;
        setPreview(null);
        if (
          !cancel &&
          active?.op &&
          samePlacements(active.source.placements, latest.current.placements) &&
          sameGeometry(active.source, latest.current)
        ) {
          latest.current.onChange([active.op]);
        }
      },
    },
    options.enabled !== false && !stale,
    cancellation.signal,
  );
  return {
    previewId: stale || preview === null ? null : (current?.item.id ?? null),
    frames: bentoFrames(
      stale ? options.placements : (preview ?? options.placements),
      options,
    ),
    preview: !stale && preview !== null,
    bind: (id, kind) => ({
      ...pointer,
      onPointerDown: (event) => {
        selected.current = { id, kind };
        pointer.onPointerDown?.(event);
      },
      onKeyDown: (event) => {
        if (event.key === "Escape" && gesture.current) {
          event.preventDefault();
          event.stopPropagation();
          cancellation.abort();
          setCancellation(new AbortController());
          return;
        }
        if (
          event.defaultPrevented ||
          gesture.current ||
          options.enabled === false
        )
          return;
        const delta =
          event.key === "ArrowLeft"
            ? [-1, 0]
            : event.key === "ArrowRight"
              ? [1, 0]
              : event.key === "ArrowUp"
                ? [0, -1]
                : event.key === "ArrowDown"
                  ? [0, 1]
                  : null;
        const item = resolveBento(options.placements, options.columns).find(
          (tile) => tile.id === id,
        );
        if (!delta || !item) return;
        event.preventDefault();
        options.onChange([intent(item, kind, delta[0] ?? 0, delta[1] ?? 0)]);
      },
    }),
  };
}
