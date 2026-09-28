"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8");

function harness(response = new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/png" } })) {
  let listener;
  const calls = [];
  const chrome = {
    runtime: { id: "fixture-extension", onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } } },
    tabs: {}, scripting: {}
  };
  vm.runInNewContext(source, { chrome, URL, AbortSignal, btoa, Set, fetch: async (...args) => {
    calls.push(args);
    if (response instanceof Error) throw response;
    return response;
  } });
  return {
    calls,
    request(url, sender = { id: chrome.runtime.id, url: "https://chatgpt.com/c/synthetic-fixture" }) {
      return new Promise(resolve => assert.equal(listener({ type: "activity-dot:public-favicon", url }, sender, resolve), true));
    }
  };
}

test("allowed public favicon omits credentials, referrer, and redirects", async () => {
  const h = harness();
  assert.equal((await h.request("https://cdn.oaistatic.com/assets/favicon-test.png")).dataUrl, "data:image/png;base64,AQI=");
  assert.equal(h.calls.length, 1);
  const options = h.calls[0][1];
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  assert.equal(options.referrerPolicy, "no-referrer");
  assert.ok(options.signal);
});

for (const url of [
  "https://example.invalid/favicon.png",
  "https://chatgpt.com/backend-api/me",
  "https://chatgpt.com/favicon.png?private=fixture",
  "https://chatgpt.com/favicon.png#fixture",
  "https://fixture:fixture@chatgpt.com/favicon.png",
  "https://chatgpt.com:444/favicon.png",
  "http://chatgpt.com/favicon.png",
  "https://chatgpt.com.evil.invalid/favicon.png",
  "https://chatgpt.com/assets/%66avicon.png",
  "file:///favicon.png",
  "data:image/png;base64,AQI=",
  "not a URL"
]) test(`rejects untrusted image URL: ${url}`, async () => {
  const h = harness();
  assert.equal((await h.request(url)).dataUrl, null);
  assert.equal(h.calls.length, 0);
});

test("rejects unrelated senders before fetching", async () => {
  for (const sender of [
    { id: "other", url: "https://chatgpt.com/" },
    { id: "fixture-extension", url: "https://example.invalid/" },
    { id: "fixture-extension", url: "http://chatgpt.com/" },
    { id: "fixture-extension", url: "https://chatgpt.com:444/" },
    {}
  ]) {
    const h = harness();
    assert.equal((await h.request("https://chatgpt.com/favicon.ico", sender)).dataUrl, null);
    assert.equal(h.calls.length, 0);
  }
});

test("rejects non-image bodies and unsuccessful HTTP responses", async () => {
  for (const response of [new Response("private", { headers: { "content-type": "text/html" } }), new Response("missing", { status: 404, headers: { "content-type": "image/png" } })]) {
    assert.equal((await harness(response).request("https://chatgpt.com/favicon.png")).dataUrl, null);
  }
});

test("rejects oversized images", async () => {
  const response = new Response(new Uint8Array(262145), { headers: { "content-type": "image/png" } });
  assert.equal((await harness(response).request("https://chatgpt.com/favicon.png")).dataUrl, null);
});

test("network failures have a bounded empty result", async () => {
  assert.equal((await harness(new Error("fixture failure")).request("https://chatgpt.com/favicon.png")).dataUrl, null);
});

test("manifest exposes only documented permissions and scripts", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../extension/manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions.sort(), ["scripting", "storage"]);
  assert.deepEqual(manifest.host_permissions.sort(), ["https://cdn.oaistatic.com/*", "https://chat.openai.com/*", "https://chatgpt.com/*"]);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js"]);
});
