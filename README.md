# Maosaico (`@fungi.computer/maosaico`)

Maosaico arranges React panes inside a measured container. It supports floating
frames and optional tiling while leaving pane content, styling, controls, and
DOM focus with the host.

## Install or set up

Maosaico is a React tiling layout package. It requires React 17 or newer as a
peer dependency. From the repository root, build it with:

```sh
pnpm --filter @fungi.computer/maosaico build
```

The package exports `MaosaicoRoot`, `useMaosaicoItem`, `useMaosaicoLayout`,
`MaosaicoLayers`, `useLayer`, and `usePointerDrag` from
`@fungi.computer/maosaico`.

`usePointerDrag` supplies captured-pointer DOM props for a caller-owned gesture.
Its `move` callback receives incremental pixel deltas; cancellation and unmount
release the same capture. An optional third `AbortSignal` lets the caller cancel
a gesture; Escape policy stays with the caller. Grove uses it with the Caps
`ResizeHandle` for its conversation rail, without introducing a tiling root for
one sidebar width.

## Quick start

This illustrative example registers panes and asks Maosaico to tile them within
the supplied bounds:

```tsx
import { MaosaicoRoot, useMaosaicoItem } from "@fungi.computer/maosaico";

function Pane({ id }: { id: string }) {
  const pane = useMaosaicoItem({
    id,
    frame: { x: 0, y: 0, width: 320, height: 240 },
    minima: { width: 180, height: 120 },
  });

  return (
    <section
      hidden={!pane.visible}
      {...pane.props}
      style={{
        position: "absolute",
        left: pane.frame.x,
        top: pane.frame.y,
        width: pane.frame.width,
        height: pane.frame.height,
      }}
    >
      Pane content stays mounted here.
    </section>
  );
}

function Workspace() {
  return (
    <div style={{ position: "relative", width: 1000, height: 600 }}>
      <MaosaicoRoot bounds={{ width: 1000, height: 600 }} tiling={{ gap: 8 }}>
        <Pane id="chat" />
        <Pane id="files" />
      </MaosaicoRoot>
    </div>
  );
}
```

This sketch is illustrative; the layout tests exercise the public React boundary
and pane registration in [`test/tiling.test.tsx`](test/tiling.test.tsx).

## Core concepts

`MaosaicoRoot` owns layout state for one root. Pass its current container size
as `bounds`. Without `tiling`, panes use floating frames. With `tiling`, choose
`layout: "main-left" | "main-top" | "columns" | "rows" | "grid"`. `main-left` is
the default: the first pane is the main pane and companions stack beside it.
`main-top` puts the main pane above its companions. The preferred `mainSize` is
the main width or height respectively, clamped to pane minima and available
space; these layouts expose one draggable divider.

`columns`, `rows`, and `grid` use equal cells and ignore `mainSize`; they have
no main divider. Grid starts near-square by tile count and adapts to the
container's capacity. Equal layouts preserve leading tiles and group overflow in
the final cell, showing that group's most recently focused pane. Minima account
for every member of a group, so changing its active tab does not move the cell.
If even one minimum cannot fit, a single full-container tab group keeps a pane
readable. The caller renders tabs from `tabGroups`; hidden panes stay mounted.

`useMaosaicoItem` registers an ID, starting frame, and minimum size. The
returned binding provides the current frame, visibility, active state, drag
props, and `focus`, `snap`, and `restore` actions. Keep keyed content mounted
when a pane is hidden; apply `hidden={!visible}` so hidden content leaves input
and accessibility navigation. Closing a pane means removing it from the mounted
list.

### Shell layers

`MaosaicoLayers` renders five isolated sibling overlay roots: `chrome`,
`popover`, `dialog`, `toast`, `tooltip`. Mount it inside the shell's positioned
container, outside clipped panes. The host loads Stipe's stylesheet; Maosaico
consumes its layer tokens. Overlay roots are pointer-transparent; set
`pointerEvents: "auto"` on their interactive content.

`MaosaicoRegion` supplies the `desktop` and `windows` layers in the host's
positioned work area. It forwards ordinary div attributes and a ref, keeps the
host's positioning styles, and owns isolation and the layer token. Inside
`MaosaicoLayers`, it also registers that region for `useLayer`. A windows region
is inert while the dialog root contains painted content; closing the dialog
releases it without remounting windows or desktop content.

`useLayer("popover")` returns the nearest provider's portal container. It is
`null` until that root mounts, and during server rendering. Outside a provider
it returns `document.body`, so standalone overlays keep an ordinary portal
container. Pass the container to the maintained overlay primitive, or use React
DOM's `createPortal`. Choosing a layer does not implement positioning,
light-dismiss, focus trapping or iframe occlusion.

Place window content in `<MaosaicoRegion layer="windows">` and merge the
binding's `stackingStyle` into each window's style. Its rank is dense, starting
at zero, and follows the layout owner's focus order.
`useMaosaicoLayout().stackingStyle` ranks divider and snap decorations directly
above the windows inside the same region. Arbitrarily many ranks stay below
`chrome` because the windows root owns their stacking context. Each shell's
roots and window order are independent; portaled content stays mounted when
other layer roots change.

`useMaosaicoLayout` provides focus and swap commands, zoom and restore, tile
order, tab groups, divider interaction, and pending snap information. Pass a
`containerRef` for edge snapping relative to a positioned workspace, such as a
workbench below a toolbar.

## API reference

The package has no generated API page. See the public
[exports and types](src/index.ts); implementation details such as state
collections remain private.

## Examples and checks

The
[Layouts / Automatic Tiling in the shared workbench](../caps/workbench/maosaico.stories.tsx)
demonstrates tiling, tabs, divider resizing, floating panes, zoom, focus, and
swapping. Run the workbench from the repository root with:

```sh
pnpm workbench:serve
```

The focused tests cover layout, tiling, pointer contracts, and the public
boundary:

```sh
pnpm --filter @fungi.computer/maosaico test
```

The browser proof also mounts 33 windows through the public bindings, checks
that chrome receives real pointer clicks before and after raising a window, and
consumes Stipe's actual CSS rather than reproducing its numbers.

The browser pointer proof is available separately with
`pnpm --filter @fungi.computer/maosaico browser:contract`; it does not prove a
mounted Tourtois App.

## Limits and errors

Maosaico stores layout state only for the lifetime of a mounted root. It does
not persist frames, provide App identity, own keyboard policy, or move/focus the
caller's content. The host provides bounds, minima, controls, theme, and
animation. Resize gestures and tiled mode do not offer snap targets.

Bounds, minima, and size preferences are layout measurements and must be finite
and nonnegative. Maosaico adapts the MaoMaoLabs core gesture and snap behavior;
see [`LICENSE`](LICENSE) for its MIT license terms and attribution.

## Contribute and license

Maosaico is MIT licensed; see [`LICENSE`](LICENSE).

`MaosaicoLayers onDismiss` reports host-window blur and focus entering the
windows region. Compose it with Caps `OverlayRoot subscribeDismiss` to retire
transient popovers and tooltips together; blocking dialogs and toasts stay live.

### Controlled bento grids

`arrangeBento` reflows caller-owned `{ id, col, row, w, h }` placements into 1,
2 or 4 columns. Spans clamp to the current grid; collisions push occupants down
and vertical gaps compact deterministically. IDs are unique within a grid.
`applyBentoOps` accepts move and resize intents without mutating the input.
`bentoFrames` maps accepted cells to container-relative pixel frames. Every
accepted move or resize compacts all tiles to an `arrangeBento` fixpoint;
downward moves pass the intersecting occupant. Cells and their extents must fit
finite safe integers; duplicate IDs throw. There is no engine product quota on
tile count or size.

`useMaosaicoBento` takes those placements, measured `width`, `columns`,
`rowHeight`, `gap` and an `onChange(ops)` callback. Optional `rowHeights`
provide measured pixel heights for individual rows; missing rows use
`rowHeight`. Frames and pointer snapping share those row boundaries. Changing
measurements cancels an in-flight gesture; equal fresh arrays preserve it. These
measurements never change the integer placements. Its `previewId` names only the
live gesture tile. Its `frames` include the live pointer preview. Spread
`bind(id, "move")` or `bind(id, "resize")` onto a focusable handle with
`touchAction: "none"`. Arrow keys propose one cell; Escape, lost capture,
disabling, unmount and host geometry changes cancel a pointer gesture. A
completed drop proposes operations through `onChange`; the host accepts them
with `applyBentoOps` and supplies the new placements.

The host chooses breakpoints and persists its own placements. Reflow does not
rewrite storage, and bento does not change `MaosaicoRoot` window behavior. The
[controlled bento story](../caps/workbench/bento.stories.tsx) composes Caps
SectionCard and Button. The [browser contract](test/browser/bento.proof.tsx)
exercises real captured-pointer move, resize, cancellation and keyboard input.

## Native hosts

`@fungi.computer/maosaico/headless` exports `createMaosaicoState` and
`arrangeTiles` without the React renderer. The native TUI shell uses the same
focus, grouping, divider and zoom state in terminal cells. Browser bento and
window geometry keep their existing entrypoints and rules.

## Packed consumer readiness

Run `pnpm run build`, `pnpm run pack` and `pnpm run stranger` in this package.
The maintained stranger proof installs only package tarballs into a fresh npm
consumer, checks the exact shipped files, runs the public runtime fixture and
compiles every JavaScript entrypoint with strict NodeNext and no library-check
skip. This qualification does not publish npm releases or push a repository
split.

See [LICENSE](LICENSE) for the license and the package manifest for its public
repository destination.
