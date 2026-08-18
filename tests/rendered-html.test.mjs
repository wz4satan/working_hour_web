import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the Working Hour application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>工时记录 · Working Hour<\/title>/);
  assert.match(html, /正在读取本机记录/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("ships local persistence, backup, offline and Excel capabilities", async () => {
  const [app, storage, excel, manifest, worker] = await Promise.all([
    readFile(new URL("../app/WorkingHourWebApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/excel.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(storage, /indexedDB\.open/);
  assert.match(app, /导出 Excel 周报/);
  assert.match(app, /导出 JSON备份/);
  assert.match(app, /navigator\.share/);
  assert.match(excel, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(excel, /SUM\(F4:F10\)/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(worker, /CACHE_NAME/);
});
