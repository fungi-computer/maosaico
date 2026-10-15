import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  MaosaicoRoot,
  useMaosaicoItem,
  useMaosaicoLayout,
} from "../src/index.js";

const initial = { x: 80, y: 60, width: 160, height: 120 };
function Probe({ resize = false }: { resize?: boolean }) {
  const binding = useMaosaicoItem(
    { id: "a", frame: initial, minima: { width: 60, height: 40 } },
    { kind: resize ? "resize" : "drag" },
  );
  const layout = useMaosaicoLayout();
  return (
    <>
      <div
        data-handle
        data-frame={JSON.stringify(binding.frame)}
        {...binding.props}
      />
      <output>{JSON.stringify(layout.snapPreview)}</output>
      <button onClick={binding.restore}>Restore</button>
    </>
  );
}

function setup(resize = false) {
  const container = document.createElement("div");
  document.body.append(container);
  container.getBoundingClientRect = () => new DOMRect(100, 70, 400, 300);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MaosaicoRoot
        bounds={{ width: 400, height: 300 }}
        containerRef={{ current: container }}
      >
        <Probe resize={resize} />
      </MaosaicoRoot>,
    );
  });
  const handle = container.querySelector<HTMLElement>("[data-handle]");
  if (!handle) throw new Error("Missing drag handle");
  handle.setPointerCapture = () => undefined;
  handle.hasPointerCapture = () => false;
  const send = (type: string, x = 200, y = 150) => {
    act(() => {
      handle.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
          clientX: x,
          clientY: y,
        }),
      );
    });
  };
  return {
    send,
    frame: () => handle.dataset.frame,
    preview: () => container.querySelector("output")?.textContent,
    restore: () => {
      act(() => {
        container.querySelector("button")?.click();
      });
    },
    dispose: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("container-relative edge snap", () => {
  it.each([
    ["left", 101, 220, { x: 0, y: 0, width: 200, height: 300 }],
    ["right", 499, 220, { x: 200, y: 0, width: 200, height: 300 }],
    ["top-left", 101, 71, { x: 0, y: 0, width: 200, height: 150 }],
    ["top-right", 499, 71, { x: 200, y: 0, width: 200, height: 150 }],
    ["bottom-left", 101, 369, { x: 0, y: 150, width: 200, height: 150 }],
    ["bottom-right", 499, 369, { x: 200, y: 150, width: 200, height: 150 }],
  ] as const)(
    "previews and commits %s, retaining restore geometry",
    (side, x, y, frame) => {
      const probe = setup();
      try {
        probe.send("pointerdown");
        probe.send("pointermove", x, y);
        expect(JSON.parse(probe.preview() ?? "null")).toEqual({ side, frame });
        expect(JSON.parse(probe.frame() ?? "null")).not.toEqual(frame);
        probe.send("pointerup", x, y);
        expect(JSON.parse(probe.frame() ?? "null")).toEqual(frame);
        expect(probe.preview()).toBe("null");
        probe.restore();
        expect(JSON.parse(probe.frame() ?? "null")).toEqual(initial);
      } finally {
        probe.dispose();
      }
    },
  );

  it("clears the candidate when leaving the edge or cancelling", () => {
    const probe = setup();
    try {
      probe.send("pointerdown");
      probe.send("pointermove", 101, 220);
      probe.send("pointermove", 300, 220);
      expect(probe.preview()).toBe("null");
      probe.send("pointermove", 499, 71);
      probe.send("pointercancel");
      expect(probe.preview()).toBe("null");
      expect(JSON.parse(probe.frame() ?? "null")).toEqual(initial);
    } finally {
      probe.dispose();
    }
  });

  it("never offers a snap during resizing", () => {
    const probe = setup(true);
    try {
      probe.send("pointerdown");
      probe.send("pointermove", 499, 71);
      expect(probe.preview()).toBe("null");
      probe.send("pointerup", 499, 71);
      expect(JSON.parse(probe.frame() ?? "null")).toEqual({
        x: 0,
        y: 60,
        width: 400,
        height: 41,
      });
    } finally {
      probe.dispose();
    }
  });
});
