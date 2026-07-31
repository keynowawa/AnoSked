import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://anosked.example/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders AnoSked metadata and hardened response headers", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);

  const html = await response.text();
  assert.match(html, /<title>AnoSked\? — A clearer school week<\/title>/i);
  assert.match(html, /Stored only on your device/i);
  assert.match(html, /manifest\.webmanifest/i);
  assert.match(html, /AnoSkedicon\.png/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps local data, install metadata, and offline imports constrained", async () => {
  const [page, scheduleCore, serviceWorker, manifest] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/schedule.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);

  assert.match(scheduleCore, /function isValidStoredData/);
  assert.match(page, /file\.size > 2_000_000/);
  assert.match(page, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(page, /const SHARE_URL = "https:\/\/anosked\.site"/);
  assert.doesNotMatch(page, /anosked\.vercel\.app/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|\beval\s*\(/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /response\.ok && response\.type === "basic"/);
  assert.match(manifest, /"name": "AnoSked\?"/);
  assert.match(manifest, /"sizes": "192x192"/);
  assert.match(manifest, /"sizes": "512x512"/);
  assert.match(manifest, /"purpose": "maskable"/);
  assert.match(manifest, /"theme_color": "#89D0EF"/i);
});

test("ships keyboard-safe dialogs and permits browser zoom", async () => {
  const [dialog, layout, page] = await Promise.all([
    readFile(new URL("../app/components/AccessibleDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(page, /className="skip-link"/);
  assert.match(layout, /statusBarStyle: "black-translucent"/);
  assert.doesNotMatch(layout, /userScalable|maximumScale/);
});

test("ships preview-first image exports and persistent appearance choices", async () => {
  const [page, styles, imageModule] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/scheduleImage.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Preview your schedule/);
  assert.match(page, /Save to device/);
  assert.match(page, /anosked\.appearance\.v1/);
  assert.match(page, /prefers-color-scheme: dark/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(styles, /\.schedule-preview\.wallpaper/);
  assert.match(styles, /\.meeting-fields\s*\{[^}]*minmax\(0,1fr\)/);
  for (const theme of ["sky", "rose", "meadow", "sunshine", "midnight", "electric"]) assert.match(imageModule, new RegExp(`id: "${theme}"`));
  assert.match(page, /navigator\.vibrate/);
  assert.doesNotMatch(page, /Mascot artwork keeps its original colors/);
  assert.match(page, /Created by mmmkay studios/);
  assert.match(page, /Semester dates/);
  assert.doesNotMatch(page, /Kyann Tagle/);
});
