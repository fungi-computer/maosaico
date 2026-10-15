import { proveBento } from "./bento.assertions.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { URL } from "node:url";
const out = await mkdtemp(join(tmpdir(), "maosaico-browser-"));
const entry = join(out, "entry.js");
await build({
  entryPoints: ["test/browser/contract.proof.tsx"],
  bundle: true,
  format: "iife",
  outfile: entry,
  jsx: "automatic",
  conditions: ["style"],
});
await writeFile(
  join(out, "index.html"),
  '<link rel="stylesheet" href="entry.css"><div id="app"></div><script src="entry.js"></script>',
);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const name = ["/entry.js", "/entry.css"].includes(path)
    ? path.slice(1)
    : "index.html";
  response.setHeader(
    "Content-Type",
    name.endsWith(".css")
      ? "text/css"
      : name.endsWith(".js")
        ? "text/javascript"
        : "text/html",
  );
  response.end(await readFile(join(out, name)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(
  address !== null && Object.hasOwn(address, "port"),
  "TCP server failed",
);
const port = address.port;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1_000, height: 800 },
  });
  await page.goto("http://127.0.0.1:" + port + "/");
  const a = page.locator("#one #a");
  const b = page.locator("#one #b");

  const pointIn = async (locator) => {
    const box = await locator.boundingBox();
    assert.ok(box, "public binding was not rendered");
    return { x: box.x + 2, y: box.y + 2 };
  };
  const begin = async (locator) => {
    const point = await pointIn(locator);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    return point;
  };

  const aPoint = await begin(a);
  assert.equal(await a.evaluate((node) => node.hasPointerCapture(1)), true);
  await page.mouse.move(aPoint.x + 360, aPoint.y + 260);
  assert.match(await a.getAttribute("data-frame"), /"x":280/);
  assert.notEqual(
    await a.getAttribute("data-frame"),
    await page.locator("#two #a").getAttribute("data-frame"),
  );
  await a.evaluate((node) => node.releasePointerCapture(1));
  await page.mouse.move(aPoint.x + 10, aPoint.y + 10);
  await page.waitForTimeout(20);
  assert.match(await a.getAttribute("data-frame"), /"x":10/);
  assert.equal(await a.evaluate((node) => node.hasPointerCapture(1)), false);
  await page.mouse.up();
  const committed = await begin(a);
  await page.mouse.move(committed.x + 360, committed.y + 260);
  await page.mouse.up();
  const committedFrame = await a.getAttribute("data-frame");
  assert.notEqual(
    committedFrame,
    JSON.stringify({ width: 200, height: 150, x: 10, y: 20 }),
  );
  await page.locator('#one [data-action="rerender"]').click();
  assert.equal(await a.getAttribute("data-frame"), committedFrame);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  const cancelPoint = await pointIn(a);
  const cancelStartFrame = await a.getAttribute("data-frame");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: cancelPoint.x, y: cancelPoint.y, id: 1 }],
  });
  await page.waitForFunction(() => {
    const node = globalThis.document.querySelector("#one #a");
    return (
      node &&
      Array.from({ length: 10 }, (_, id) => id + 1).some((id) =>
        node.hasPointerCapture(id),
      )
    );
  });
  const touchPointerId = await a.evaluate((node) =>
    Array.from({ length: 10 }, (_, id) => id + 1).find((id) =>
      node.hasPointerCapture(id),
    ),
  );
  assert.ok(touchPointerId, "touch pointer was not captured");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: cancelPoint.x - 1, y: cancelPoint.y, id: 1 }],
  });
  await page.waitForFunction(
    (start) =>
      globalThis.document
        .querySelector("#one #a")
        ?.getAttribute("data-frame") !== start,
    cancelStartFrame,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await page.waitForFunction(
    (start) =>
      globalThis.document
        .querySelector("#one #a")
        ?.getAttribute("data-frame") === start,
    cancelStartFrame,
  );
  assert.equal(await a.getAttribute("data-frame"), cancelStartFrame);
  assert.equal(
    await a.evaluate((node, id) => node.hasPointerCapture(id), touchPointerId),
    false,
  );

  await begin(a);
  await a
    .locator("button")
    .last()
    .evaluate((button) => button.click());
  await page.waitForFunction(
    () => !globalThis.document.querySelector("#one #a"),
  );
  assert.equal(
    await page.locator("#one #b").getAttribute("data-active"),
    "true",
  );
  await begin(b);
  assert.equal(await b.evaluate((node) => node.hasPointerCapture(1)), true);
  await page.mouse.up();
  await page.locator('#one [data-action="remount"]').click();
  await page.waitForFunction(() =>
    globalThis.document
      .querySelector("#one #a")
      ?.getAttribute("data-frame")
      ?.includes('"x":50'),
  );

  await b.locator("button").first().click();
  await b.locator("button").last().click();
  assert.match(await b.getAttribute("data-frame"), /"x":160/);

  const bPoint = await begin(b);
  assert.equal(await b.evaluate((node) => node.hasPointerCapture(1)), true);
  await page.mouse.move(bPoint.x + 340, bPoint.y + 460);
  assert.match(await b.getAttribute("data-frame"), /"width":400/);
  await page.mouse.up();

  const chrome = page.locator("[data-layer-chrome]");
  await chrome.scrollIntoViewIfNeeded();
  assert.equal(await page.locator("[data-layer-window]").count(), 33);
  const ranks = () =>
    page
      .locator("[data-layer-window]")
      .evaluateAll((windows) =>
        windows
          .map((window) => Number(window.style.zIndex))
          .sort((a, b) => a - b),
      );
  assert.deepEqual(
    await ranks(),
    Array.from({ length: 33 }, (_, index) => index),
  );
  const centreHitsChrome = () =>
    chrome.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return (
        node.ownerDocument.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ) === node
      );
    });
  assert.equal(
    await centreHitsChrome(),
    true,
    "33 windows must never cover chrome",
  );
  await chrome.click();
  assert.equal(await chrome.textContent(), "Chrome clicked 1");
  await page.getByRole("button", { name: "Focus first window" }).click();
  await page.waitForFunction(
    () =>
      globalThis.document
        .querySelector('[data-layer-window="window-0"]')
        ?.getAttribute("data-active") === "true",
  );
  assert.deepEqual(
    await ranks(),
    Array.from({ length: 33 }, (_, index) => index),
  );
  assert.equal(
    await centreHitsChrome(),
    true,
    "raising a window stays inside its own layer",
  );
  await chrome.click();
  assert.equal(await chrome.textContent(), "Chrome clicked 2");
  await proveBento(page, "http://127.0.0.1:" + port + "/");
} finally {
  if (browser) await browser.close();
  server.close();
  await rm(out, { recursive: true, force: true });
}
