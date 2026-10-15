import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useMaosaicoBento, applyBentoOps } from "../src/index.js";

it("proposes keyboard moves and resizes without changing the controlled source", async () => {
  const source = [{ id: "a", col: 0, row: 0, w: 1, h: 1 }];
  const changed = vi.fn();
  function Probe() {
    const layout = useMaosaicoBento({
      placements: source,
      columns: 4,
      width: 408,
      rowHeight: 120,
      gap: 8,
      onChange: changed,
    });
    return (
      <>
        <button {...layout.bind("a", "move")}>Move</button>
        <button {...layout.bind("a", "resize")}>Resize</button>
      </>
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => {
      root.render(<Probe />);
    });
    const move = container.querySelector("button");
    const resize = container.querySelectorAll("button")[1];
    if (!move || !resize) throw new Error("Bento handles missing");
    await act(() =>
      move.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    await act(() =>
      resize.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    expect(changed.mock.calls).toEqual([
      [[{ kind: "move", id: "a", col: 1, row: 0 }]],
      [[{ kind: "resize", id: "a", w: 1, h: 2 }]],
    ]);
    expect(source).toEqual([{ id: "a", col: 0, row: 0, w: 1, h: 1 }]);
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

it.each(["drop", "escape", "reflow"])(
  "keeps equal fresh-array previews live, then handles %s",
  async (finish) => {
    const changed = vi.fn();
    const source = [{ id: "a", col: 0, row: 0, w: 1, h: 1 }];
    function Probe({ columns }: { columns: 2 | 4 }) {
      const layout = useMaosaicoBento({
        placements: source.map((item) => ({ ...item })),
        columns,
        width: 408,
        rowHeight: 120,
        gap: 8,
        onChange: changed,
      });
      return (
        <>
          <button {...layout.bind("a", "move")}>Move</button>
          <output
            data-preview={layout.preview}
            data-preview-id={layout.previewId}
          />
        </>
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => {
        root.render(<Probe columns={4} />);
      });
      const handle = container.querySelector("button");
      if (!handle) throw new Error("Bento move handle missing");
      const captured = new Set<number>();
      handle.setPointerCapture = (id) => {
        captured.add(id);
      };
      handle.hasPointerCapture = (id) => captured.has(id);
      handle.releasePointerCapture = (id) => {
        captured.delete(id);
      };
      await act(() =>
        handle.dispatchEvent(
          new PointerEvent("pointerdown", {
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            clientX: 0,
            bubbles: true,
          }),
        ),
      );
      await act(() =>
        handle.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: 1,
            clientX: 104,
            bubbles: true,
          }),
        ),
      );
      expect(container.querySelector("output")?.dataset.preview).toBe("true");
      expect(container.querySelector("output")?.dataset.previewId).toBe("a");
      if (finish === "escape")
        await act(() =>
          handle.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          ),
        );
      if (finish === "reflow")
        act(() => {
          root.render(<Probe columns={2} />);
        });
      if (finish !== "drop") {
        expect(container.querySelector("output")?.dataset.preview).toBe(
          "false",
        );
        expect(
          container.querySelector("output")?.dataset.previewId,
        ).toBeUndefined();
      }
      await act(() =>
        handle.dispatchEvent(
          new PointerEvent("pointerup", { pointerId: 1, bubbles: true }),
        ),
      );
      if (finish === "drop")
        expect(changed).toHaveBeenCalledWith([
          { kind: "move", id: "a", col: 1, row: 0 },
        ]);
      else expect(changed).not.toHaveBeenCalled();
      expect(captured.size).toBe(0);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  },
);

it.each([1, 3])("accepts ArrowDown past a %i-row neighbour", async (height) => {
  function Probe() {
    const [source, setSource] = useState([
      { id: "a", col: 0, row: 0, w: 1, h: 1 },
      { id: "b", col: 0, row: 1, w: 1, h: height },
    ]);
    const layout = useMaosaicoBento({
      placements: source,
      columns: 1,
      width: 408,
      rowHeight: 120,
      gap: 8,
      onChange: (ops) => {
        setSource([...applyBentoOps(source, ops, 1)]);
      },
    });
    return (
      <>
        <button {...layout.bind("a", "move")}>Move a</button>
        <output>{JSON.stringify([...layout.frames])}</output>
      </>
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    act(() => {
      root.render(<Probe />);
    });
    const handle = container.querySelector("button");
    if (!handle) throw new Error("Move handle missing");
    await act(() =>
      handle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    expect(container.querySelector("output")?.textContent).toBe(
      JSON.stringify([
        ["a", { x: 0, y: 128 * height, width: 408, height: 120 }],
        ["b", { x: 0, y: 0, width: 408, height: 128 * height - 8 }],
      ]),
    );
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});

it.each(["keyboard", "pointer"])(
  "moves one place in a four-tile stack through %s",
  async (input) => {
    const changed = vi.fn();
    function Probe() {
      const [source, setSource] = useState(
        ["a", "b", "c", "d"].map((id, row) => ({
          id,
          col: 0,
          row,
          w: 1,
          h: 1,
        })),
      );
      const layout = useMaosaicoBento({
        placements: source,
        columns: 1,
        width: 408,
        rowHeight: 120,
        gap: 8,
        onChange: (ops) => {
          changed(ops);
          setSource([...applyBentoOps(source, ops, 1)]);
        },
      });
      return (
        <>
          <button {...layout.bind("a", "move")}>Move a</button>
          <output>{JSON.stringify([...layout.frames])}</output>
        </>
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const expected = JSON.stringify([
      ["a", { x: 0, y: 128, width: 408, height: 120 }],
      ["b", { x: 0, y: 0, width: 408, height: 120 }],
      ["c", { x: 0, y: 256, width: 408, height: 120 }],
      ["d", { x: 0, y: 384, width: 408, height: 120 }],
    ]);
    try {
      act(() => {
        root.render(<Probe />);
      });
      const handle = container.querySelector("button");
      if (!handle) throw new Error("Move handle missing");
      if (input === "keyboard") {
        await act(() =>
          handle.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
          ),
        );
      } else {
        const captured = new Set<number>();
        handle.setPointerCapture = (id) => {
          captured.add(id);
        };
        handle.hasPointerCapture = (id) => captured.has(id);
        handle.releasePointerCapture = (id) => {
          captured.delete(id);
        };
        await act(() =>
          handle.dispatchEvent(
            new PointerEvent("pointerdown", {
              pointerId: 1,
              pointerType: "mouse",
              button: 0,
              bubbles: true,
            }),
          ),
        );
        await act(() =>
          handle.dispatchEvent(
            new PointerEvent("pointermove", {
              pointerId: 1,
              clientY: 128,
              bubbles: true,
            }),
          ),
        );
        expect(container.querySelector("output")?.textContent).toBe(expected);
        expect(changed).not.toHaveBeenCalled();
        await act(() =>
          handle.dispatchEvent(
            new PointerEvent("pointerup", { pointerId: 1, bubbles: true }),
          ),
        );
      }
      expect(container.querySelector("output")?.textContent).toBe(expected);
      expect(changed).toHaveBeenCalledOnce();
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  },
);

it.each(["move", "resize"] as const)(
  "snaps %s to measured row boundaries and cancels changed geometry",
  async (kind) => {
    const changed = vi.fn();
    function Probe({ heights }: { heights: readonly number[] }) {
      const layout = useMaosaicoBento({
        placements: [{ id: "a", col: 0, row: 0, w: 1, h: 1 }],
        columns: 1,
        width: 390,
        rowHeight: 280,
        gap: 16,
        rowHeights: [...heights],
        onChange: changed,
      });
      return (
        <>
          <button {...layout.bind("a", kind)}>Handle</button>
          <output data-preview={layout.preview} />
        </>
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      act(() => {
        root.render(<Probe heights={[80, 100, 120]} />);
      });
      const handle = container.querySelector("button");
      if (!handle) throw new Error("Measured Bento handle missing");
      const captured = new Set<number>();
      handle.setPointerCapture = (id) => {
        captured.add(id);
      };
      handle.hasPointerCapture = (id) => captured.has(id);
      handle.releasePointerCapture = (id) => {
        captured.delete(id);
      };
      const pointer = async (type: string, y: number) => {
        await act(() =>
          handle.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType: "mouse",
              button: 0,
              clientY: y,
              bubbles: true,
            }),
          ),
        );
      };
      await pointer("pointerdown", 0);
      await pointer("pointermove", 100);
      // Fresh but equal measurements preserve the gesture.
      act(() => {
        root.render(<Probe heights={[80, 100, 120]} />);
      });
      await pointer("pointerup", 100);
      expect(changed).toHaveBeenCalledWith([
        kind === "move"
          ? { kind, id: "a", col: 0, row: 1 }
          : { kind, id: "a", w: 1, h: 2 },
      ]);
      changed.mockClear();
      await pointer("pointerdown", 0);
      await pointer("pointermove", 100);
      act(() => {
        root.render(<Probe heights={[180, 100, 120]} />);
      });
      expect(container.querySelector("output")?.dataset.preview).toBe("false");
      await pointer("pointerup", 100);
      expect(changed).not.toHaveBeenCalled();
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  },
);
