import {
  createContext,
  createElement,
  forwardRef,
  useEffect,
  useRef,
  useImperativeHandle,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type ReactElement,
  type HTMLAttributes,
  type FocusEvent,
} from "react";

/** Shell paint order. Window ranks are local to the windows root. */
export type MaosaicoLayer =
  "desktop" | "windows" | "chrome" | "popover" | "dialog" | "toast" | "tooltip";

const layers: readonly MaosaicoLayer[] = [
  "chrome",
  "popover",
  "dialog",
  "toast",
  "tooltip",
];
const Context = createContext<{
  roots: ReadonlyMap<MaosaicoLayer, HTMLElement>;
  update: (layer: MaosaicoLayer, element: HTMLElement | null) => void;
  dismiss: (() => void) | undefined;
} | null>(null);

/**
 * Mount inside the shell's positioned container, outside clipped panes.
 * Roots are pointer-transparent; interactive portal content enables pointers.
 * The host supplies Stipe's stylesheet and retains content and focus ownership.
 */
export function MaosaicoLayers({
  children,
  onDismiss,
}: {
  children?: ReactNode;
  /** Light-dismiss transient overlays on host blur or focus entering a window. */
  onDismiss?: () => void;
}): ReactElement {
  const [roots, setRoots] = useState<ReadonlyMap<MaosaicoLayer, HTMLElement>>(
    () => new Map(),
  );
  const update = useCallback(
    (name: MaosaicoLayer, element: HTMLElement | null) => {
      setRoots((current) => {
        if ((current.get(name) ?? null) === element) return current;
        const next = new Map(current);
        if (element) next.set(name, element);
        else next.delete(name);
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    if (!onDismiss) return;
    window.addEventListener("blur", onDismiss);
    return () => {
      window.removeEventListener("blur", onDismiss);
    };
  }, [onDismiss]);
  const refs = useMemo(
    () =>
      new Map<MaosaicoLayer, (element: HTMLDivElement | null) => void>(
        layers.map((name) => [
          name,
          (element) => {
            update(name, element);
          },
        ]),
      ),
    [update],
  );
  return createElement(
    Context.Provider,
    {
      value: useMemo(
        () => ({ roots, update, dismiss: onDismiss }),
        [roots, update, onDismiss],
      ),
    },
    children,
    layers.map((name) =>
      createElement("div", {
        key: name,
        ref: refs.get(name),
        "data-maosaico-layer": name,
        style: {
          position: "absolute",
          inset: 0,
          isolation: "isolate",
          pointerEvents: "none",
          zIndex: `var(--stipe-layer-${name})`,
        },
      }),
    ),
  );
}

/** Null until the shell root mounts (also during SSR); body outside a shell. */
export function useLayer(layer: MaosaicoLayer): HTMLElement | null {
  const roots = useContext(Context);
  if (roots !== null) return roots.roots.get(layer) ?? null;
  return Object.hasOwn(globalThis, "document") ? document.body : null;
}

/** The host positions the region; Maosaico owns its isolated layer and modality. */
export const MaosaicoRegion = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    layer: "desktop" | "windows";
  }
>(function MaosaicoRegion({ layer, style, children, ...props }, forwardedRef) {
  const context = useContext(Context);
  const update = context?.update;
  const dialog = context?.roots.get("dialog");
  const [modal, setModal] = useState(false);
  useEffect(() => {
    if (!dialog) return;
    const refresh = () => {
      setModal(
        Array.from(dialog.querySelectorAll("*")).some((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      );
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(dialog, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    return () => {
      observer.disconnect();
    };
  }, [dialog]);
  const elementRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
    forwardedRef,
    () => elementRef.current,
  );
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      elementRef.current = element;
      update?.(layer, element);
    },
    [update, layer],
  );
  return createElement(
    "div",
    {
      ...props,
      ref,
      onFocusCapture: (event: FocusEvent<HTMLDivElement>) => {
        // React bubbles focus from portaled overlays through this region; only
        // focus that really lands in a window dismisses open overlays.
        if (
          layer === "windows" &&
          event.target instanceof Node &&
          event.currentTarget.contains(event.target)
        )
          context?.dismiss?.();
        props.onFocusCapture?.(event);
      },
      "data-maosaico-layer": layer,
      inert: layer === "windows" && modal ? "" : undefined,
      style: {
        position: "relative",
        ...style,
        isolation: "isolate",
        zIndex: `var(--stipe-layer-${layer})`,
      },
    },
    children,
  );
});
