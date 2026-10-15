import process from "node:process";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

export async function proveBento(page, url) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url + "?bento");
  const stored = () =>
    page.locator("output").getAttribute("data-placements").then(JSON.parse);
  const original = await stored();
  const move = page.getByRole("button", { name: "Move launcher", exact: true });
  const resize = page.getByRole("button", {
    name: "Resize launcher",
    exact: true,
  });
  async function drag(handle, dx, dy) {
    const box = await handle.boundingBox();
    assert.ok(box);
    await handle.focus();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
    );
    await page.waitForFunction(
      () =>
        globalThis.document.querySelector("output")?.dataset.preview === "true",
    );
    assert.deepEqual(
      await stored(),
      original,
      "pointer preview must not write the controlled source",
    );
  }
  await drag(move, 243, 0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(
    await stored(),
    original,
    "Escape cancels without committing a drop",
  );
  await drag(move, 243, 0);
  await page.mouse.up();
  assert.equal((await stored())[0].col, 1);
  assert.equal(
    (await stored())[1].row,
    1,
    "drop displaces the intersecting Inbox",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await drag(resize, 243, 192);
  await page.mouse.up();
  assert.equal((await stored())[0].w, 3);
  assert.equal((await stored())[0].h, 2);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await resize.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal((await stored())[0].w, 3);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await drag(move, 243, 0);
  // A host reflow retires the live pointer preview, rather than accepting stale cells.
  await page.evaluate(() =>
    globalThis.document.querySelectorAll("button")[1].click(),
  );
  assert.equal(
    await page.locator("output").getAttribute("data-preview"),
    "false",
  );
  await page.mouse.up();
  assert.deepEqual(await stored(), original);
  assert.equal(
    await page.locator("output").getAttribute("data-preview"),
    "false",
  );
  await page.getByRole("button", { name: "One column", exact: true }).click();
  assert.deepEqual(
    await stored(),
    original,
    "reflow does not persist breakpoint-specific placements",
  );
  const frames = await page
    .locator("[data-tile]")
    .evaluateAll((nodes) =>
      nodes.map((node) => JSON.parse(node.dataset.frame)),
    );
  assert.ok(frames[1].y >= frames[0].height);
  const shots = process.env.BENTO_SHOTS;
  if (shots) {
    await mkdir(shots, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(url + "?bento");
      await page
        .getByRole("heading", { name: "Controlled bento layout" })
        .waitFor();
      await page.screenshot({ path: shots + `/arranged-${width}.png` });
      await page
        .getByRole("button", { name: "Resize launcher", exact: true })
        .focus();
      await page.keyboard.press("ArrowDown");
      await page.screenshot({ path: shots + `/resized-${width}.png` });
    }
  }
}
