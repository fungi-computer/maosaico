import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  MaosaicoRoot,
  useMaosaicoItem,
  type MaosaicoItem,
} from "../src/index.js";
const bounds = { width: 400, height: 300 };
const item = (id: string, x = 10): MaosaicoItem => ({
  id,
  frame: { x, y: 20, width: 200, height: 150 },
  minima: { width: 100, height: 80 },
});
function Probe({ value }: { value: MaosaicoItem }) {
  const binding = useMaosaicoItem(value, {
    kind: value.id === "b" ? "resize" : "drag",
  });
  return (
    <div
      data-testid={value.id}
      data-frame={JSON.stringify(binding.frame)}
      data-active={binding.active}
      {...binding.props}
    >
      <button
        data-action="snap"
        onClick={() => {
          binding.snap("left");
        }}
      />
      <button data-action="restore" onClick={binding.restore} />
    </div>
  );
}
function Host({ values }: { values: MaosaicoItem[] }) {
  return (
    <MaosaicoRoot bounds={bounds}>
      {values.map((value) => (
        <Probe key={value.id} value={value} />
      ))}
    </MaosaicoRoot>
  );
}
describe("Maosaico public seam", () => {
  it("cancels the matching pointer and restores its start frame", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(<Host values={[item("a")]} />);
    });
    const found = host.querySelector('[data-testid="a"]');
    if (!(found instanceof HTMLElement)) throw new Error("probe missing");
    Object.defineProperty(found, "setPointerCapture", {
      value: () => undefined,
    });
    Object.defineProperty(found, "hasPointerCapture", { value: () => false });
    act(() => {
      found.dispatchEvent(
        Object.assign(new Event("pointerdown", { bubbles: true }), {
          pointerId: 3,
          button: 0,
          clientX: 10,
          clientY: 20,
        }),
      );
      found.dispatchEvent(
        Object.assign(new Event("pointercancel", { bubbles: true }), {
          pointerId: 3,
        }),
      );
    });
    expect(found.getAttribute("data-frame")).toContain('"x":10');
    await act(async () => {
      found.querySelector<HTMLButtonElement>('[data-action="snap"]')?.click();
      await Promise.resolve();
    });
    expect(found.getAttribute("data-frame")).toContain('"x":0');
    await act(async () => {
      found
        .querySelector<HTMLButtonElement>('[data-action="restore"]')
        ?.click();
      await Promise.resolve();
    });
    expect(found.getAttribute("data-frame")).toContain('"x":10');
  });

  it("resizes through the public binding within supplied minima and bounds", () => {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(<Host values={[item("b")]} />);
    });
    const node = host.querySelector('[data-testid="b"]');
    if (!(node instanceof HTMLElement)) throw new Error("resize probe missing");
    Object.defineProperty(node, "setPointerCapture", {
      value: () => undefined,
    });
    Object.defineProperty(node, "hasPointerCapture", { value: () => false });
    act(() => {
      node.dispatchEvent(
        Object.assign(new Event("pointerdown", { bubbles: true }), {
          pointerId: 8,
          pointerType: "mouse",
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      );
      node.dispatchEvent(
        Object.assign(new Event("pointermove", { bubbles: true }), {
          pointerId: 8,
          pointerType: "mouse",
          clientX: -500,
          clientY: -500,
        }),
      );
    });
    const minimum = node.getAttribute("data-frame");
    expect(minimum).toContain('"width":100');
    expect(minimum).toContain('"height":80');
  });

  it("preserves committed identity across caller rerender and remounts", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<Host values={[item("a"), item("b", 30)]} />);
    });
    const first = host.querySelector('[data-testid="a"]');
    if (!(first instanceof HTMLElement)) throw new Error("a probe missing");
    Object.defineProperty(first, "setPointerCapture", {
      value: () => undefined,
    });
    Object.defineProperty(first, "hasPointerCapture", { value: () => false });
    act(() => {
      first.dispatchEvent(
        Object.assign(new Event("pointerdown", { bubbles: true }), {
          pointerId: 11,
          pointerType: "mouse",
          button: 0,
          clientX: 10,
          clientY: 20,
        }),
      );
      first.dispatchEvent(
        Object.assign(new Event("pointermove", { bubbles: true }), {
          pointerId: 11,
          pointerType: "mouse",
          clientX: 60,
          clientY: 20,
        }),
      );
      first.dispatchEvent(
        Object.assign(new Event("pointerup", { bubbles: true }), {
          pointerId: 11,
        }),
      );
      root.render(<Host values={[item("a", 1), item("b", 30)]} />);
    });
    expect(
      host.querySelector('[data-testid="a"]')?.getAttribute("data-frame"),
    ).toContain('"x":60');
    act(() => {
      root.render(<Host values={[item("b", 30)]} />);
    });
    expect(
      host.querySelector('[data-testid="b"]')?.getAttribute("data-active"),
    ).toBe("true");
    act(() => {
      root.render(<Host values={[item("b", 30), item("a", 50)]} />);
    });
    expect(
      host.querySelector('[data-testid="a"]')?.getAttribute("data-frame"),
    ).toContain('"x":50');
    expect(
      host.querySelector('[data-testid="a"]')?.getAttribute("data-active"),
    ).toBe("true");
    act(() => {
      root.unmount();
    });
  });
});
