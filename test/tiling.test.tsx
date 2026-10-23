import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  MaosaicoRoot,
  useMaosaicoItem,
  useMaosaicoLayout,
  type TilingLayout,
} from "../src/index.js";
import { arrangeTiles } from "../src/tiling.js";

const ids = ["chat", "files", "preview"];
const minima = new Map(ids.map((id) => [id, { width: 180, height: 120 }]));
const wide = { width: 1000, height: 600 };
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function Pane({
  id,
  participating = true,
}: {
  id: string;
  participating?: boolean;
}) {
  const binding = useMaosaicoItem(
    {
      id,
      frame: { x: 600, y: 20, width: 240, height: 160 },
      minima: { width: 180, height: 120 },
    },
    { participating },
  );
  return (
    <section
      data-pane={id}
      data-active={binding.active}
      hidden={!binding.visible}
      {...binding.props}
      style={{
        position: "absolute",
        left: binding.frame.x,
        top: binding.frame.y,
        width: binding.frame.width,
        height: binding.frame.height,
      }}
    >
      <input aria-label={id} defaultValue="draft" />
    </section>
  );
}
function Controls() {
  const layout = useMaosaicoLayout();
  return (
    <>
      <button
        onClick={() => {
          layout.focus("files");
        }}
      >
        files
      </button>
      <button
        onClick={() => {
          layout.zoom("files");
        }}
      >
        zoom
      </button>
      <button
        onClick={() => {
          layout.zoom(null);
        }}
      >
        unzoom
      </button>
      <button
        onClick={() => {
          layout.swap("chat", "files");
        }}
      >
        swap
      </button>
      <button
        onClick={() => {
          layout.resizeMain(650);
        }}
      >
        resize
      </button>
      {layout.divider && <div data-divider {...layout.divider.props} />}
    </>
  );
}
function mount(
  initialBounds = wide,
  layout: "main-left" | "main-top" = "main-left",
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (
    bounds = wide,
    tiled = true,
    panes = ids,
    participation: Partial<Record<string, boolean>> = {},
    nextLayout: TilingLayout = layout,
  ) => {
    act(() => {
      root.render(
        <MaosaicoRoot
          bounds={bounds}
          tiling={
            tiled
              ? {
                  layout: nextLayout,
                  mainSize: nextLayout === "main-top" ? 300 : 600,
                  gap: 8,
                }
              : undefined
          }
        >
          <Controls />
          {panes.map((id) => (
            <Pane
              key={id}
              id={id}
              {...(participation[id] === undefined
                ? {}
                : { participating: participation[id] })}
            />
          ))}
        </MaosaicoRoot>,
      );
    });
  };
  const pane = (id: string) => {
    const node = host.querySelector<HTMLElement>(`[data-pane="${id}"]`);
    if (!node) throw new Error(`Missing pane ${id}`);
    return node;
  };
  const click = (label: string) => {
    act(() => {
      const button = [...host.querySelectorAll("button")].find(
        (node) => node.textContent === label,
      );
      if (!button) throw new Error(`Missing button ${label}`);
      button.click();
    });
  };
  cleanups.push(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });
  render(initialBounds);
  return { host, render, pane, click };
}

describe("automatic main and companions", () => {
  it("parks a mounted item without spending a tile or accepting focus, then restores its frame and DOM", () => {
    const { pane, click, render } = mount();
    const files = pane("files");
    const input = files.querySelector("input");
    if (!input) throw new Error("Missing input");
    input.value = "parked draft";
    render(wide, true, ids, { files: false });
    expect(pane("files")).toBe(files);
    expect(files.hidden).toBe(true);
    expect(files.dataset.active).toBe("false");
    expect(files.style.width).toBe("240px");
    click("files");
    expect(files.dataset.active).toBe("false");
    expect(pane("chat").style.width).toBe("600px");
    render(wide, true, ids, { files: true });
    expect(pane("files")).toBe(files);
    expect(files.hidden).toBe(false);
    expect(input.value).toBe("parked draft");
    expect(files.style.width).toBe("392px");
  });
  it("retains the initial floating frame before a container is measured", () => {
    const { pane, render } = mount({ width: 0, height: 0 });
    render(wide, false);
    expect(pane("files").style.left).toBe("600px");
    expect(pane("files").style.width).toBe("240px");
  });
  it("keeps visible focus when another pane opens during zoom", () => {
    const { pane, click, render } = mount();
    click("zoom");
    render(wide, true, [...ids, "terminal"]);
    expect(pane("files").hidden).toBe(false);
    expect(pane("files").dataset.active).toBe("true");
    expect(pane("terminal").hidden).toBe(true);
  });

  it("starts floating movement at the visible position after a root shrink", () => {
    const { pane, render } = mount();
    render({ width: 400, height: 300 }, false);
    const target = pane("files");
    expect(target.style.left).toBe("160px");
    Object.defineProperty(target, "setPointerCapture", {
      value: () => undefined,
    });
    Object.defineProperty(target, "hasPointerCapture", { value: () => false });
    act(() => {
      for (const [type, x] of [
        ["pointerdown", 200],
        ["pointermove", 190],
      ] as const) {
        target.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true }), {
            pointerId: 8,
            pointerType: "mouse",
            button: 0,
            clientX: x,
            clientY: 0,
          }),
        );
      }
    });
    expect(target.style.left).toBe("150px");
  });
  it("partitions available space, preserves minima and falls back to readable tabs", () => {
    const layout = arrangeTiles(ids, minima, ids, wide, {
      mainSize: 600,
      gap: 8,
    });
    expect([...layout.frames.values()]).toEqual([
      { x: 0, y: 0, width: 600, height: 600 },
      { x: 608, y: 0, width: 392, height: 296 },
      { x: 608, y: 304, width: 392, height: 296 },
    ]);
    const short = arrangeTiles(
      ids,
      minima,
      ["preview", "files", "chat"],
      { width: 1000, height: 180 },
      {},
    );
    expect(short.tabGroups).toEqual([["files", "preview"]]);
    expect([...short.frames.keys()]).toEqual(["chat", "files"]);
    const narrow = arrangeTiles(
      ids,
      minima,
      ids,
      { width: 320, height: 600 },
      {},
    );
    expect(narrow.tabGroups).toEqual([ids]);
    expect([...narrow.frames.values()]).toEqual([
      { x: 0, y: 0, width: 320, height: 600 },
    ]);
  });

  it("tiles main-top with a bounded vertical divider", () => {
    const vertical = arrangeTiles(
      ["preview", "terminal"],
      new Map([
        ["preview", { width: 240, height: 140 }],
        ["terminal", { width: 240, height: 120 }],
      ]),
      ["preview", "terminal"],
      { width: 560, height: 400 },
      { layout: "main-top", mainSize: 280, gap: 8 },
    );
    expect(vertical.frames.get("preview")).toEqual({
      x: 0,
      y: 0,
      width: 560,
      height: 272,
    });
    expect(vertical.frames.get("terminal")).toEqual({
      x: 0,
      y: 280,
      width: 560,
      height: 120,
    });
    expect(vertical.divider).toEqual({
      axis: "y",
      position: 272,
      min: 140,
      max: 272,
    });

    const tooShort = arrangeTiles(
      ["preview", "terminal"],
      new Map([
        ["preview", { width: 240, height: 140 }],
        ["terminal", { width: 240, height: 120 }],
      ]),
      ["preview", "terminal"],
      { width: 560, height: 250 },
      { layout: "main-top", gap: 8 },
    );
    expect(tooShort.tabGroups).toEqual([["preview", "terminal"]]);
    expect(tooShort.divider).toBeNull();
  });

  it("preserves live input across all named layouts without remounting", () => {
    const { pane, render } = mount();
    const original = pane("chat");
    const input = original.querySelector("input");
    if (!input) throw new Error("Missing input");
    input.value = "unsent work";
    for (const name of [
      "grid",
      "columns",
      "rows",
      "main-top",
      "main-left",
    ] as const) {
      render(wide, true, ids, {}, name);
      expect(pane("chat")).toBe(original);
      expect(original.querySelector("input")).toBe(input);
      expect(input.value).toBe("unsent work");
    }
  });

  it("preserves the exact live input through focus, zoom, swaps, mode changes and resizing", () => {
    const { pane, click, render } = mount();
    const original = pane("files");
    const input = original.querySelector("input");
    if (!input) throw new Error("Missing input");
    input.value = "unsent work";
    const firstTop = original.style.top;
    click("files");
    expect(original.style.top).toBe(firstTop);
    click("zoom");
    expect(pane("chat").hidden).toBe(true);
    expect(original.style.width).toBe("1000px");
    click("unzoom");
    click("swap");
    expect(original.style.width).toBe("600px");
    render({ width: 320, height: 500 });
    expect(original.hidden).toBe(false);
    expect(pane("chat").hidden).toBe(true);
    render();
    expect(original.style.width).toBe("600px");
    render(wide, false);
    expect(original.style.width).toBe("240px");
    render();
    expect(pane("files")).toBe(original);
    expect(input.value).toBe("unsent work");
  });

  it("remembers preferred width after narrow bounds and reflows surviving panes on close", () => {
    const { pane, click, render } = mount();
    click("resize");
    render({ width: 700, height: 600 });
    expect(pane("chat").style.width).toBe("512px");
    render();
    expect(pane("chat").style.width).toBe("650px");
    render(wide, true, ["chat", "files"]);
    expect(pane("files").style.height).toBe("600px");
    render(wide, true, ["files"]);
    expect(pane("files").style.width).toBe("1000px");
  });

  it("cancels a divider to its original preference even after root resize", () => {
    const { host, pane, render } = mount();
    const divider = host.querySelector<HTMLElement>("[data-divider]");
    if (!divider) throw new Error("Missing divider");
    Object.defineProperty(divider, "setPointerCapture", {
      value: () => undefined,
    });
    Object.defineProperty(divider, "hasPointerCapture", { value: () => false });
    const pointer = (type: string, x: number) => {
      act(() => {
        divider.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true }), {
            pointerId: 4,
            pointerType: "mouse",
            button: 0,
            clientX: x,
            clientY: 0,
          }),
        );
      });
    };
    pointer("pointerdown", 600);
    pointer("pointermove", 680);
    expect(pane("chat").style.width).toBe("680px");
    render({ width: 700, height: 600 });
    pointer("pointercancel", 680);
    render();
    expect(pane("chat").style.width).toBe("600px");
  });

  it("drags and cancels a y-axis divider without remounting the pane", () => {
    const { host, pane, click } = mount(wide, "main-top");
    const original = pane("chat");
    const divider = host.querySelector<HTMLElement>("[data-divider]");
    if (!divider) throw new Error("Missing divider");
    Object.defineProperty(divider, "setPointerCapture", {
      value: () => undefined,
    });
    Object.defineProperty(divider, "hasPointerCapture", { value: () => false });
    const pointer = (type: string, y: number) => {
      act(() => {
        divider.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true }), {
            pointerId: 5,
            pointerType: "mouse",
            button: 0,
            clientX: 0,
            clientY: y,
          }),
        );
      });
    };
    expect(original.style.height).toBe("300px");
    pointer("pointerdown", 300);
    pointer("pointermove", 340);
    expect(original.style.height).toBe("340px");
    pointer("pointercancel", 340);
    expect(original.style.height).toBe("300px");
    click("zoom");
    expect(original.hidden).toBe(true);
    click("unzoom");
    expect(pane("chat")).toBe(original);
    expect(original.style.height).toBe("300px");
  });
});
