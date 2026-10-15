import { BentoContract } from "./bento.proof.js";
import { LayerContract } from "./layers.proof.js";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MaosaicoRoot,
  useMaosaicoItem,
  type MaosaicoItem,
} from "../../src/index.js";
const bounds = { width: 400, height: 300 };
const items: MaosaicoItem[] = [
  {
    id: "a",
    frame: { x: 10, y: 10, width: 120, height: 100 },
    minima: { width: 80, height: 60 },
  },
  {
    id: "b",
    frame: { x: 160, y: 40, width: 120, height: 100 },
    minima: { width: 80, height: 60 },
  },
];
function Item({
  value,
  remove,
}: {
  value: MaosaicoItem;
  remove?: (() => void) | undefined;
}) {
  const binding = useMaosaicoItem(value, {
    kind: value.id === "b" ? "resize" : "drag",
  });
  return (
    <div
      id={value.id}
      data-frame={JSON.stringify(binding.frame)}
      data-active={binding.active}
      {...binding.props}
    >
      <button
        onClick={() => {
          binding.snap("left");
        }}
      >
        snap
      </button>
      <button onClick={binding.restore}>restore</button>
      {remove && <button onClick={remove}>remove</button>}
    </div>
  );
}
function Root({ id }: { id: string }) {
  const [visible, setVisible] = useState(items.map((value) => value.id));
  const [conflict, setConflict] = useState(false);
  const [remounted, setRemounted] = useState(false);
  const shown = items.filter((value) => visible.includes(value.id));
  const supplied = shown.map((value) =>
    remounted && value.id === "a"
      ? { ...value, frame: { ...value.frame, x: 50 } }
      : conflict
        ? { ...value, frame: { ...value.frame, x: 1 } }
        : value,
  );
  return (
    <section id={id}>
      <button
        data-action="rerender"
        onClick={() => {
          setConflict(true);
        }}
      >
        rerender
      </button>
      <button
        data-action="remount"
        onClick={() => {
          setRemounted(true);
          setVisible((ids) => (ids.includes("a") ? ids : [...ids, "a"]));
        }}
      >
        remount
      </button>
      <MaosaicoRoot bounds={bounds}>
        {supplied.map((value) => (
          <Item
            key={value.id}
            value={value}
            remove={
              id === "one" && value.id === "a"
                ? () => {
                    setVisible((ids) =>
                      ids.filter((item) => item !== value.id),
                    );
                  }
                : undefined
            }
          />
        ))}
      </MaosaicoRoot>
    </section>
  );
}
const root = document.getElementById("app");
if (!root) throw new Error("browser test root missing");
createRoot(root).render(
  new URLSearchParams(window.location.search).has("bento") ? (
    <BentoContract />
  ) : (
    <>
      <Root id="one" />
      <Root id="two" />
      <LayerContract />
    </>
  ),
);
