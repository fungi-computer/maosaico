import { StrictMode, act, createRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MaosaicoLayers,
  MaosaicoRegion,
  MaosaicoRoot,
  useLayer,
  useMaosaicoItem,
  type MaosaicoLayer,
} from "../src/index.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function Portal({
  layer,
  children,
}: {
  layer: MaosaicoLayer;
  children: ReactNode;
}) {
  const container = useLayer(layer);
  return container ? createPortal(children, container) : null;
}

function mount(children: ReactNode) {
  const host = document.createElement("main");
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });
  const render = (content: ReactNode) => {
    act(() => {
      root.render(content);
    });
  };
  render(children);
  return { host, render };
}

describe("Maosaico layers", () => {
  it("portals into the nearest shell's isolated named root and retains live content", () => {
    const content = (label: string) => (
      <StrictMode>
        <MaosaicoLayers>
          <Portal layer="popover">
            <input aria-label={label} />
          </Portal>
          <section>
            <MaosaicoLayers>
              <Portal layer="popover">
                <button>Inner menu</button>
              </Portal>
            </MaosaicoLayers>
          </section>
        </MaosaicoLayers>
      </StrictMode>
    );
    const { host, render } = mount(content("Draft"));
    const input = host.querySelector("input");
    const inner = host.querySelector("button");
    if (!input || !inner) throw new Error("Missing portaled controls");
    expect(input.parentElement?.dataset.maosaicoLayer).toBe("popover");
    expect(inner.parentElement).not.toBe(input.parentElement);
    expect(input.parentElement?.style.isolation).toBe("isolate");
    input.value = "Unsent text";
    render(content("Renamed draft"));
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("Unsent text");
    render(null);
    expect(host.querySelector("[data-maosaico-layer]")).toBeNull();
  });

  it("uses the host document body when no Maosaico shell owns the overlay", () => {
    mount(
      <Portal layer="dialog">
        <button>Standalone dialog</button>
      </Portal>,
    );
    expect(document.querySelector("button")?.parentElement).toBe(document.body);
  });

  it("keeps host-positioned regions live and blocks windows until a dialog retires", async () => {
    const reference = createRef<HTMLDivElement>();
    function Regions({ open }: { open: boolean }) {
      return (
        <MaosaicoLayers>
          <MaosaicoRegion
            layer="desktop"
            style={{ position: "absolute", top: 32 }}
          >
            <input aria-label="Desktop draft" />
          </MaosaicoRegion>
          <MaosaicoRegion layer="windows" ref={reference}>
            <button>Window action</button>
          </MaosaicoRegion>
          {open ? (
            <Portal layer="dialog">
              <button
                ref={(element) => {
                  if (element)
                    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
                      new DOMRect(0, 0, 200, 100),
                    );
                }}
              >
                Dialog action
              </button>
            </Portal>
          ) : null}
        </MaosaicoLayers>
      );
    }
    const { host, render } = mount(<Regions open={false} />);
    const window = reference.current;
    const draft = host.querySelector("input");
    expect(
      host.querySelectorAll('[data-maosaico-layer="windows"]'),
    ).toHaveLength(1);
    expect(window?.style.isolation).toBe("isolate");
    expect(window?.style.zIndex).toBe("var(--stipe-layer-windows)");
    const desktop = host.querySelector<HTMLElement>(
      '[data-maosaico-layer="desktop"]',
    );
    expect(desktop?.style.top).toBe("32px");
    await act(async () => {
      render(<Regions open />);
      await Promise.resolve();
    });
    expect(window?.hasAttribute("inert")).toBe(true);
    expect(host.querySelector("input")).toBe(draft);
    await act(async () => {
      render(<Regions open={false} />);
      await Promise.resolve();
    });
    expect(window?.hasAttribute("inert")).toBe(false);
    expect(reference.current).toBe(window);
  });

  it("dismisses shell overlays when a child receives focus or the host window blurs", () => {
    const dismiss = vi.fn();
    const { host, render } = mount(
      <MaosaicoLayers onDismiss={dismiss}>
        <MaosaicoRegion layer="windows">
          <button>Child action</button>
        </MaosaicoRegion>
        <Portal layer="popover">
          <button>Menu action</button>
        </Portal>
      </MaosaicoLayers>,
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-maosaico-layer="popover"] button',
        )
        ?.focus(),
    );
    expect(dismiss).not.toHaveBeenCalled();
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[data-maosaico-layer="windows"] button',
        )
        ?.focus(),
    );
    expect(dismiss).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(dismiss).toHaveBeenCalledTimes(2);
    render(null);
    window.dispatchEvent(new Event("blur"));
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it("keeps an overlay a window opened when focus moves into it", () => {
    const dismiss = vi.fn();
    const { host } = mount(
      <MaosaicoLayers onDismiss={dismiss}>
        <MaosaicoRegion layer="windows">
          {/* A window's own picker portals its list; React still bubbles
              that list's focus through the window region. */}
          <Portal layer="popover">
            <input aria-label="Search Computers" />
          </Portal>
        </MaosaicoRegion>
      </MaosaicoLayers>,
    );
    act(() =>
      host
        .querySelector<HTMLInputElement>(
          '[data-maosaico-layer="popover"] input',
        )
        ?.focus(),
    );
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("keeps window ranks dense through focus and removal", () => {
    function Window({ id }: { id: string }) {
      const pane = useMaosaicoItem({
        id,
        frame: { x: 0, y: 0, width: 100, height: 100 },
        minima: { width: 0, height: 0 },
      });
      return (
        <button style={pane.stackingStyle} onClick={pane.focus}>
          {id}
        </button>
      );
    }
    const windows = (ids: readonly string[]) => (
      <MaosaicoRoot bounds={{ width: 400, height: 300 }}>
        <MaosaicoLayers>
          <MaosaicoRegion layer="windows">
            {ids.map((id) => (
              <Window key={id} id={id} />
            ))}
          </MaosaicoRegion>
        </MaosaicoLayers>
      </MaosaicoRoot>
    );
    const { host, render } = mount(windows(["a", "b", "c"]));
    const ranks = () =>
      Array.from(
        host.querySelectorAll("button"),
        (button) => button.style.zIndex,
      );
    expect(ranks()).toEqual(["0", "1", "2"]);
    act(() => host.querySelector("button")?.click());
    expect(ranks()).toEqual(["2", "0", "1"]);
    render(windows(["a", "c"]));
    expect(ranks()).toEqual(["1", "0"]);
  });
});
