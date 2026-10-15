import { createMaosaicoState } from "@fungi.computer/maosaico/headless";

const state = createMaosaicoState();
state.register(
  "note",
  { x: 0, y: 0, width: 300, height: 200 },
  { width: 100, height: 100 },
);
console.log(state.frames.get("note"));
state.destroy();
