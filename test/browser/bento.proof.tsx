import { useState } from "react";
import { applyBentoOps, useMaosaicoBento } from "../../src/index.js";
import type { BentoColumns } from "../../src/index.js";

const initial = [
  { id: "launcher", col: 0, row: 0, w: 2, h: 1 },
  { id: "inbox", col: 2, row: 0, w: 2, h: 2 },
];
/** A controlled host: the same stored placements are reflowed, never rewritten, at breakpoints. */
export function BentoContract() {
  const [placements, setPlacements] = useState(initial);
  const [columns, setColumns] = useState<BentoColumns>(
    window.innerWidth <= 540 ? 2 : 4,
  );
  const width = Math.min(960, window.innerWidth - 32);
  const layout = useMaosaicoBento({
    placements: placements.map((item) => ({ ...item })),
    columns,
    width,
    rowHeight: 180,
    gap: 12,
    onChange: (ops) => {
      setPlacements((current) => [...applyBentoOps(current, ops, columns)]);
    },
  });
  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>Controlled bento layout</h1>
      <p>
        Move and resize handles snap to cells. Escape cancels the preview. Arrow
        keys propose one cell.
      </p>
      <button
        onClick={() => {
          setColumns(4);
        }}
      >
        Four columns
      </button>
      <button
        onClick={() => {
          setColumns(2);
        }}
      >
        Two columns
      </button>
      <button
        onClick={() => {
          setColumns(1);
        }}
      >
        One column
      </button>
      <button
        onClick={() => {
          setPlacements(initial);
        }}
      >
        Reset
      </button>
      <output
        data-placements={JSON.stringify(placements)}
        data-preview={layout.preview}
      />
      <div style={{ position: "relative", width, height: 760, marginTop: 16 }}>
        {placements.map((tile) => {
          const frame = layout.frames.get(tile.id);
          if (!frame) return null;
          return (
            <section
              key={tile.id}
              data-tile={tile.id}
              data-frame={JSON.stringify(frame)}
              style={{
                position: "absolute",
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                boxSizing: "border-box",
                border: "1px solid #888",
                padding: 12,
                background: "#f6f6f6",
              }}
            >
              <h2>{tile.id === "launcher" ? "Launcher" : "Inbox"}</h2>
              <button
                aria-label={`Move ${tile.id}`}
                style={{ touchAction: "none" }}
                {...layout.bind(tile.id, "move")}
              >
                Move
              </button>
              <button
                aria-label={`Resize ${tile.id}`}
                style={{ touchAction: "none" }}
                {...layout.bind(tile.id, "resize")}
              >
                Resize
              </button>
              <p>
                {tile.id === "launcher"
                  ? "Inkcap · Grove · Prints"
                  : "Draft ready · Review requested"}
              </p>
            </section>
          );
        })}
      </div>
    </main>
  );
}
