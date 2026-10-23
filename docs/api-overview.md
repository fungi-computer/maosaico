# API reference

`createMaosaicoState` owns frames, minima and layout mode. Register and
unregister panes through that state, then call `destroy()` at host teardown.
`arrangeTiles` computes frames from IDs, minima and container bounds. The root
adds React rendering; `./headless` keeps the layout model separate.

## Public entrypoints

- `@fungi.computer/maosaico`
- `@fungi.computer/maosaico/headless`

Type declarations ship beside each JavaScript entrypoint. The README owns usage,
lifetime rules and limitations.
