/* No conversation/API requests, analytics, or remote code. */
"use strict";

const CHAT_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const IMAGE_HOSTS = new Set([...CHAT_HOSTS, "cdn.oaistatic.com"]);

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] });
  await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({
    target: { tabId: tab.id }, files: ["content.js"]
  })));
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "activity-dot:public-favicon") return false;
  (async () => {
    const from = new URL(sender.url || "https://invalid.invalid");
    const url = new URL(message.url);
    if (sender.id !== chrome.runtime.id || from.protocol !== "https:" ||
        !CHAT_HOSTS.has(from.hostname) || from.port ||
        url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname) ||
        url.port || url.username || url.password || url.search || url.hash ||
        !/^\/(?:[a-z0-9_-]+\/)*favicon[a-z0-9_.-]*\.(ico|svg|png|webp)$/i.test(url.pathname)) {
      throw new Error("Not an allowed public favicon");
    }
    const response = await fetch(url.href, {
      credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(6000)
    });
    const mime = response.headers.get("content-type")?.split(";")[0].trim() || "";
    if (!response.ok || !["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon", "image/webp"].includes(mime) || !response.body) {
      throw new Error("Image unavailable");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) throw new Error("Image exceeds favicon size limit");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    let binary = "";
    for (const chunk of chunks) for (let i = 0; i < chunk.length; i += 8192) {
      binary += String.fromCharCode(...chunk.subarray(i, i + 8192));
    }
    reply({ dataUrl: `data:${mime};base64,${btoa(binary)}` });
  })().catch(() => reply({ dataUrl: null }));
  return true;
});
