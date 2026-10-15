import type { Frame } from "./layout.js";

/** Host-selected responsive grid; Maosaico does not select breakpoints. */
export type BentoColumns = 1 | 2 | 4;
/** A caller-owned tile in integer grid cells. IDs are unique within a grid. */
export type BentoPlacement = Readonly<{
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
}>;
/** Intent proposed by the interaction binding and accepted by the host. */
export type BentoOp =
  | Readonly<{ kind: "move"; id: string; col: number; row: number }>
  | Readonly<{ kind: "resize"; id: string; w: number; h: number }>;
/** Container-relative pixel geometry supplied by the measured host. */
export type BentoGeometry = Readonly<{
  columns: BentoColumns;
  width: number;
  rowHeight: number;
  /** Measured row heights; omitted rows retain rowHeight. Cells stay unchanged. */
  rowHeights?: readonly number[] | undefined;
  gap: number;
}>;

const overlaps = (a: BentoPlacement, b: BentoPlacement) =>
  a.col < b.col + b.w &&
  a.col + a.w > b.col &&
  a.row < b.row + b.h &&
  a.row + a.h > b.row;
function cell(value: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(value) || !Number.isSafeInteger(rounded))
    throw new RangeError("Bento cells must be finite safe integers");
  return rounded;
}
const normalize = (
  item: BentoPlacement,
  columns: BentoColumns,
): BentoPlacement => {
  const w = Math.max(1, Math.min(columns, cell(item.w)));
  return {
    ...item,
    w,
    h: Math.max(1, cell(item.h)),
    col: Math.max(0, Math.min(columns - w, cell(item.col))),
    row: Math.max(0, cell(item.row)),
  };
};

export function resolveBento(
  placements: readonly BentoPlacement[],
  columns: BentoColumns,
  priority?: string,
): readonly BentoPlacement[] {
  if (new Set(placements.map((item) => item.id)).size !== placements.length)
    throw new RangeError("Bento IDs must be unique");
  const ordered = placements
    .map((item) => normalize(item, columns))
    .sort(
      (a, b) =>
        Number(b.id === priority) - Number(a.id === priority) ||
        a.row - b.row ||
        a.col - b.col,
    );
  const pushed: BentoPlacement[] = [];
  for (const item of ordered) {
    let next = item;
    // Each jump passes at least one occupant; work is bounded by the tile count,
    // rather than by a persisted row number.
    for (let attempt = 0; attempt <= pushed.length; attempt += 1) {
      const collisions = pushed.filter((other) => overlaps(next, other));
      if (collisions.length === 0) break;
      next = {
        ...next,
        row: Math.max(...collisions.map((other) => other.row + other.h)),
      };
    }
    if (!Number.isSafeInteger(next.row + next.h))
      throw new RangeError("Bento extent exceeds safe integer cells");
    pushed.push(next);
  }
  const byId = new Map(pushed.map((item) => [item.id, item]));
  return placements.map((item) => byId.get(item.id) ?? item);
}

function settle(
  placements: readonly BentoPlacement[],
  columns: BentoColumns,
  priority?: string,
): readonly BentoPlacement[] {
  const pushed = resolveBento(placements, columns, priority);
  const chosen = pushed.find((item) => item.id === priority);
  const packed: BentoPlacement[] = chosen ? [chosen] : [];
  for (const item of [...pushed].sort(
    (a, b) => a.row - b.row || a.col - b.col,
  )) {
    if (item.id === priority) continue;
    const rows = [
      ...new Set([0, ...packed.map((other) => other.row + other.h)]),
    ]
      .filter((row) => row <= item.row)
      .sort((a, b) => a - b);
    const row = rows.find(
      (candidate) =>
        !packed.some((other) => overlaps({ ...item, row: candidate }, other)),
    );
    packed.push({ ...item, row: row ?? item.row });
  }
  if (chosen) {
    const others = packed.filter((item) => item.id !== chosen.id);
    const rows = [...new Set([0, ...others.map((item) => item.row + item.h)])]
      .filter((row) => row <= chosen.row)
      .sort((a, b) => a - b);
    const row = rows.find(
      (candidate) =>
        !others.some((item) => overlaps({ ...chosen, row: candidate }, item)),
    );
    return settle(
      placements.map((item) =>
        item.id === chosen.id
          ? { ...chosen, row: row ?? chosen.row }
          : (others.find((other) => other.id === item.id) ?? item),
      ),
      columns,
    );
  }
  const byId = new Map(packed.map((item) => [item.id, item]));
  return placements.map((item) => byId.get(item.id) ?? item);
}

/** Reflow spans and compact vertical gaps while retaining stable tile identity/order. */
export function arrangeBento(
  placements: readonly BentoPlacement[],
  columns: BentoColumns,
): readonly BentoPlacement[] {
  return settle(placements, columns);
}

function downwardTarget(
  item: BentoPlacement,
  op: Extract<BentoOp, { kind: "move" }>,
  placements: readonly BentoPlacement[],
  columns: BentoColumns,
): BentoPlacement {
  const target = normalize({ ...item, col: op.col, row: op.row }, columns);
  if (target.row <= item.row) return target;
  const occupants = placements.filter(
    (other) => other.id !== item.id && overlaps(target, other),
  );
  return {
    ...target,
    row: Math.max(
      target.row,
      ...occupants.map((other) => other.row + other.h - item.h),
    ),
  };
}

/** Apply intents in order, reorder downward past occupants, then compact every tile. */
export function applyBentoOps(
  placements: readonly BentoPlacement[],
  ops: readonly BentoOp[],
  columns: BentoColumns,
): readonly BentoPlacement[] {
  let result = resolveBento(placements, columns);
  for (const op of ops) {
    if (op.kind === "move") {
      const item = result.find((item) => item.id === op.id);
      const target = item
        ? normalize({ ...item, col: op.col, row: op.row }, columns)
        : undefined;
      const occupant =
        target && item && target.col !== item.col
          ? result.find(
              (other) =>
                other.id !== item.id &&
                overlaps(target, other) &&
                other.row === target.row &&
                other.w === item.w &&
                other.h === item.h,
            )
          : undefined;
      if (item && target && occupant) {
        result = settle(
          result.map((other) =>
            other.id === item.id
              ? { ...target, col: occupant.col, row: occupant.row }
              : other.id === occupant.id
                ? { ...other, col: item.col, row: item.row }
                : other,
          ),
          columns,
        );
        continue;
      }
    }
    result = settle(
      result.map((item) =>
        item.id !== op.id
          ? item
          : op.kind === "move"
            ? downwardTarget(item, op, result, columns)
            : { ...item, w: op.w, h: op.h },
      ),
      columns,
      op.id,
    );
  }
  return result;
}

/** Pixel origin of an integer row, shared by frames and pointer snapping. */
export function bentoRowOffset(row: number, geometry: BentoGeometry): number {
  const measured = geometry.rowHeights ?? [];
  const count = Math.min(row, measured.length);
  return (
    measured
      .slice(0, count)
      .reduce((sum, height) => sum + height + geometry.gap, 0) +
    (row - count) * (geometry.rowHeight + geometry.gap)
  );
}

/** Nearest row boundary for a pointer; remaining rows use the uniform stride. */
export function bentoRowAt(y: number, geometry: BentoGeometry): number {
  let offset = 0;
  const measured = geometry.rowHeights ?? [];
  for (let row = 0; row < measured.length; row += 1) {
    const stride = (measured[row] ?? geometry.rowHeight) + geometry.gap;
    if (y < offset + stride / 2) return row;
    offset += stride;
  }
  const stride = geometry.rowHeight + geometry.gap;
  return (
    measured.length +
    (stride > 0 ? Math.max(0, Math.round((y - offset) / stride)) : 0)
  );
}

/** Map cells to frames; content and scrolling remain with the host. */
export function bentoFrames(
  placements: readonly BentoPlacement[],
  geometry: BentoGeometry,
): ReadonlyMap<string, Frame> {
  const { columns, width, rowHeight, gap } = geometry;
  if (
    ![width, rowHeight, gap, ...(geometry.rowHeights ?? [])].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    throw new RangeError("Bento pixel geometry must be finite and nonnegative");
  const cellWidth = Math.max(0, width - gap * (columns - 1)) / columns;
  return new Map(
    resolveBento(placements, columns).map((item) => [
      item.id,
      {
        x: item.col * (cellWidth + gap),
        y: bentoRowOffset(item.row, geometry),
        width: item.w * cellWidth + (item.w - 1) * gap,
        height:
          bentoRowOffset(item.row + item.h, geometry) -
          bentoRowOffset(item.row, geometry) -
          gap,
      },
    ]),
  );
}
