import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MaosaicoLayers,
  MaosaicoRegion,
  MaosaicoRoot,
  useLayer,
  useMaosaicoItem,
  useMaosaicoLayout,
  type MaosaicoLayer,
} from "../../src/index.js";
import "@fungi.computer/stipe/styles.css";

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

function Window({ id }: { id: string }) {
  const pane = useMaosaicoItem({
    id,
    frame: { x: 0, y: 100, width: 300, height: 120 },
    minima: { width: 0, height: 0 },
  });
  return (
    <button
      data-layer-window={id}
      data-active={pane.active}
      onClick={pane.focus}
      style={{
        ...pane.stackingStyle,
        position: "absolute",
        left: pane.frame.x,
        top: pane.frame.y,
        width: pane.frame.width,
        height: pane.frame.height,
        pointerEvents: "auto",
      }}
    >
      {id}
    </button>
  );
}

function Controls() {
  const layout = useMaosaicoLayout();
  return (
    <button
      onClick={() => {
        layout.focus("window-0");
      }}
    >
      Focus first window
    </button>
  );
}

/** Thirty-three real public bindings compete with shell chrome in one document. */
export function LayerContract() {
  const [clicks, setClicks] = useState(0);
  return (
    <section
      id="layers"
      style={{ position: "relative", width: 400, height: 300 }}
    >
      <MaosaicoRoot bounds={{ width: 400, height: 300 }}>
        <MaosaicoLayers>
          <Controls />
          <MaosaicoRegion
            layer="windows"
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {Array.from({ length: 33 }, (_, index) => (
              <Window key={index} id={`window-${String(index)}`} />
            ))}
          </MaosaicoRegion>
          <Portal layer="chrome">
            <button
              data-layer-chrome
              onClick={() => {
                setClicks((value) => value + 1);
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 100,
                width: 300,
                height: 120,
                pointerEvents: "auto",
              }}
            >
              Chrome clicked {clicks}
            </button>
          </Portal>
        </MaosaicoLayers>
      </MaosaicoRoot>
    </section>
  );
}
