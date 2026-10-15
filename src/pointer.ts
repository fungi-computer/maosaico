import { useEffect, useRef } from "react";
import type { DOMAttributes, PointerEvent } from "react";

/** One captured pointer; cancellation and unmount share the same release path. */
export function usePointerDrag(
  handlers: {
    begin: (event: PointerEvent<HTMLElement>) => boolean;
    move: (dx: number, dy: number, event: PointerEvent<HTMLElement>) => void;
    end: (cancel: boolean) => void;
  },
  enabled = true,
  signal?: AbortSignal,
): DOMAttributes<HTMLElement> {
  const latest = useRef(handlers);
  latest.current = handlers;
  const pointer = useRef<{
    id: number;
    element: HTMLElement;
    x: number;
    y: number;
    release: (cancel: boolean) => void;
  } | null>(null);
  useEffect(() => {
    if (!enabled) pointer.current?.release(true);
    return () => pointer.current?.release(true);
  }, [enabled]);
  useEffect(() => {
    const cancel = () => {
      pointer.current?.release(true);
    };
    signal?.addEventListener("abort", cancel);
    return () => {
      signal?.removeEventListener("abort", cancel);
    };
  }, [signal]);
  return {
    onPointerDown: (event) => {
      if (
        !enabled ||
        signal?.aborted ||
        pointer.current ||
        (event.pointerType === "mouse" && event.button !== 0)
      )
        return;
      const { currentTarget: element, pointerId: id } = event;
      // Capture before mutating geometry, so a failed capture cannot strand a gesture.
      element.setPointerCapture(id);
      if (!latest.current.begin(event)) {
        element.releasePointerCapture(id);
        return;
      }
      const end = latest.current.end;
      const lost = () => {
        release(true);
      };
      const release = (cancel: boolean) => {
        element.removeEventListener("lostpointercapture", lost);
        pointer.current = null;
        end(cancel);
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      };
      pointer.current = {
        id,
        element,
        x: event.clientX,
        y: event.clientY,
        release,
      };
      element.addEventListener("lostpointercapture", lost);
    },
    onPointerMove: (event) => {
      const current = pointer.current;
      if (current?.id !== event.pointerId) return;
      latest.current.move(
        event.clientX - current.x,
        event.clientY - current.y,
        event,
      );
      current.x = event.clientX;
      current.y = event.clientY;
    },
    onPointerUp: (event) => {
      if (pointer.current?.id === event.pointerId)
        pointer.current.release(false);
    },
    onPointerCancel: (event) => {
      if (pointer.current?.id === event.pointerId)
        pointer.current.release(true);
    },
  };
}
