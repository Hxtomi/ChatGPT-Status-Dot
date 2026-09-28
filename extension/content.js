(() => {
  "use strict";
  const KEY = "__chatgptActivityDotV1";
  const BUILD = "1.1.0";
  const HANDOFF_EVENT = "chatgpt-activity-dot:handoff";
  const HANDOFF_ATTRIBUTE = "data-chatgpt-activity-dot-handoff";
  const ICON_ID = "chatgpt-activity-dot-favicon";
  const DEFAULTS = { enabled: true, color: "#91ACF2", doneColor: "#65D6A0" };
  const STOP_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[data-testid="stop-streaming-button"]',
    'button[data-testid="stop-task-button"]',
    'button[data-testid="stop-run-button"]'
  ].join(",");
  const STOP_NAMES = new Set([
    "stop", "stop generating", "stop generation", "stop streaming", "stop response",
    "stop responding", "stop task", "stop work", "stop working", "stop agent",
    "остановить", "остановить генерацию", "остановить ответ", "остановить выполнение",
    "остановить задачу", "остановить работу", "прекратить генерацию"
  ]);
  const FORMS = 'form, [data-type="unified-composer"], [data-testid="composer"], #composer-background';
  let previous = globalThis[KEY]?.status();
  // Reloading an extension creates a new isolated world, while the old world's
  // DOM observers can remain alive. Ask that instance to restore and detach.
  window.dispatchEvent(new Event(HANDOFF_EVENT));
  try {
    const handoff = JSON.parse(document.documentElement.getAttribute(HANDOFF_ATTRIBUTE) || "null");
    if (handoff) previous = handoff.route === location.pathname && Date.now() - handoff.at < 10000 ? handoff.state : null;
  } catch { /* Ignore stale or unrelated page data. */ }
  document.documentElement.removeAttribute(HANDOFF_ATTRIBUTE);
  globalThis[KEY]?.dispose();
  document.getElementById(ICON_ID)?.remove();

  let settings = { ...DEFAULTS };
  let busy = previous?.busy === true;
  let unread = previous?.unread === true;
  let stoppedByUser = previous?.reason === "stopped";
  let route = location.pathname;
  let disposed = false;
  let scanTimer = null;
  let idleTimer = null;
  let renderSerial = 0;
  let overlay = null;
  let lastReason = previous?.reason || "idle";
  let lastImage = "native";
  const cache = new Map();
  const originals = new Map();
  let appliedUrl = null;
  const appliedValue = attribute => attribute === "href" ? appliedUrl : attribute === "type" ? "image/svg+xml" : "any";
  function originalValue(link, attribute) {
    const current = link.getAttribute(attribute);
    return originals.has(link) && current === appliedValue(attribute) ? originals.get(link)[attribute] : current;
  }
  function restoreIcons() {
    // Removing a selected favicon does not reliably clear Chromium's cached
    // tab icon. Point that same candidate back to the original image first.
    if (overlay?.isConnected) overlay.href = nativeIcon();
    for (const [link, attributes] of originals) {
      for (const [name, value] of Object.entries(attributes)) {
        // Respect changes made by ChatGPT or another extension in the meantime.
        if (link.getAttribute(name) !== appliedValue(name)) continue;
        if (value === null) link.removeAttribute(name); else link.setAttribute(name, value);
      }
    }
    originals.clear(); appliedUrl = null;
    overlay?.remove(); overlay = null;
  }

  const normalized = value => (value || "").trim().toLowerCase().replace(/[.…]+$/u, "").trim();
  function shown(element) {
    if (!element.isConnected || element.closest('[hidden], [aria-hidden="true"]') ||
        !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
  }
  const seen = () => document.visibilityState === "visible" && document.hasFocus();
  const phase = () => busy ? "working" : unread ? "unread" : "idle";
  function stopReason(button) {
    if (!shown(button)) return null;
    if (button.matches(STOP_SELECTORS)) return button.getAttribute("data-testid");
    const label = normalized(button.getAttribute("aria-label") || button.getAttribute("title"));
    if (STOP_NAMES.has(label)) {
      // A plain Stop outside the composer can belong to an audio/video player.
      if (label === "stop" || label === "остановить") {
        if (!button.closest(FORMS)) return null;
        if (button.closest('[data-testid*="audio"], [data-testid*="voice"], [data-testid*="player"], [role="dialog"]')) return null;
      }
      return `label:${label}`;
    }
    if (!label && button.closest(FORMS) && STOP_NAMES.has(normalized(button.textContent))) return "composer-stop";
    return null;
  }
  function detect() {
    for (const button of document.querySelectorAll('button,[role="button"]')) {
      const reason = stopReason(button);
      if (reason) return reason;
    }
    return null;
  }
  function nativeIcon() {
    const links = [...document.querySelectorAll('link[rel~="icon"]')].filter(link =>
      link.id !== ICON_ID && link.href && (!link.media || matchMedia(link.media).matches));
    const selected = links.findLast(link => originalValue(link, "type") === "image/svg+xml" || originalValue(link, "sizes") === "any") || links.at(-1);
    const href = selected && originalValue(selected, "href");
    return href ? new URL(href, document.baseURI).href : `${location.origin}/favicon.ico`;
  }
  function imageFrom(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => { image.src = ""; reject(new Error("Image timeout")); }, 5000);
      image.crossOrigin = "anonymous";
      image.onload = () => { clearTimeout(timeout); resolve(image); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error("Image unavailable")); };
      image.src = url;
    });
  }
  async function drawIcon(url, color) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    let context = canvas.getContext("2d");
    let image = null;
    let fallback = false;
    try {
      // Only embedded images are loaded here. Remote favicons go through the
      // worker's allowlist and credential-free fetch; never load arbitrary DOM URLs.
      let source;
      if (/^data:image\/(?:png|svg\+xml|x-icon|vnd\.microsoft\.icon|webp);/i.test(url) && url.length <= 350000) {
        source = url;
      } else {
        const result = await chrome.runtime.sendMessage({ type: "activity-dot:public-favicon", url });
        if (!result?.dataUrl) throw new Error("No image");
        source = result.dataUrl;
      }
      image = await imageFrom(source);
      context.drawImage(image, 0, 0, 64, 64);
      canvas.toDataURL();
    } catch {
      canvas.width = 64;
      context = canvas.getContext("2d");
      fallback = true;
      context.strokeStyle = "#A7ADB8";
      context.lineWidth = 5;
      context.lineJoin = "round";
      context.beginPath();
      context.roundRect(7, 7, 47, 39, 12);
      context.stroke();
      context.beginPath(); context.moveTo(18, 46); context.lineTo(14, 56); context.lineTo(32, 46); context.stroke();
    }
    // 5.25 px dot at a 16 px tab-icon size, with a fine two-tone rim.
    context.beginPath(); context.arc(50.5, 50.5, 13.2, 0, Math.PI * 2);
    context.fillStyle = "#292633"; context.fill();
    context.beginPath(); context.arc(50.5, 50.5, 11.9, 0, Math.PI * 2);
    context.fillStyle = "#FAF7FF"; context.fill();
    context.beginPath(); context.arc(50.5, 50.5, 10.5, 0, Math.PI * 2);
    context.fillStyle = color; context.fill();
    // A site's scalable SVG icon can outrank an appended PNG in Edge.
    // Use a self-contained SVG candidate of the same priority, appended last.
    const png = canvas.toDataURL("image/png");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image width="64" height="64" href="${png}"/></svg>`;
    return { url: `data:image/svg+xml;base64,${btoa(svg)}`, fallback };
  }
  async function render() {
    const serial = ++renderSerial;
    if (phase() === "idle" || !settings.enabled || disposed) {
      restoreIcons(); return;
    }
    const source = nativeIcon();
    const color = unread && !busy ? settings.doneColor : settings.color;
    const key = `${source}|${color}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = drawIcon(source, color);
      cache.set(key, pending);
      if (cache.size > 6) cache.delete(cache.keys().next().value);
    }
    const result = await pending;
    if (serial !== renderSerial || disposed || phase() === "idle" || !settings.enabled) return;
    lastImage = result.fallback ? "fallback" : "native";
    // Chromium may keep the first eligible favicon even when a later one is
    // appended. Temporarily update every candidate and restore its exact attrs.
    const links = [...document.querySelectorAll('link[rel~="icon"]')].filter(link => link.id !== ICON_ID);
    for (const link of links) {
      const saved = {};
      for (const name of ["href", "type", "sizes"]) saved[name] = originalValue(link, name);
      originals.set(link, saved);
    }
    appliedUrl = result.url;
    for (const link of links) {
      if (link.getAttribute("href") !== appliedUrl) link.setAttribute("href", appliedUrl);
      if (link.type !== "image/svg+xml") link.type = "image/svg+xml";
      if (link.getAttribute("sizes") !== "any") link.setAttribute("sizes", "any");
    }
    if (!overlay?.isConnected) {
      overlay = document.createElement("link");
      overlay.id = ICON_ID;
      overlay.rel = "icon";
      overlay.type = "image/svg+xml";
      overlay.sizes = "any";
    }
    if (overlay.href !== result.url) overlay.href = result.url;
    document.head?.append(overlay);
  }
  function scan() {
    scanTimer = null;
    if (disposed) return;
    if (location.pathname !== route) {
      route = location.pathname; busy = false; unread = false; stoppedByUser = false;
      clearTimeout(idleTimer); idleTimer = null; void render();
    }
    const reason = detect();
    // A Stop click is definitive user intent. The old stop control can linger
    // while cancellation propagates; do not mistake it for a new generation.
    if (stoppedByUser) {
      if (!reason) stoppedByUser = false;
      return;
    }
    if (reason) {
      lastReason = reason;
      if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
      if (!busy) { busy = true; unread = false; void render(); }
    } else if (busy && idleTimer === null) {
      // Avoid flicker during a short handover from thinking to tools/answering.
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (!detect()) { busy = false; unread = !seen(); lastReason = unread ? "completed-unread" : "completed-seen"; void render(); }
        else scan();
      }, 500);
    }
  }
  function schedule() {
    if (!disposed && scanTimer === null) scanTimer = setTimeout(scan, 80);
  }
  const bodyObserver = new MutationObserver(schedule);
  bodyObserver.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["aria-label", "aria-hidden", "title", "data-testid", "hidden", "class", "style"]
  });
  const headObserver = new MutationObserver(records => {
    const iconChanged = records.some(record => {
      if (record.type === "attributes") {
        if (!(record.target instanceof HTMLLinkElement) || record.target.id === ICON_ID) return false;
        if (originals.has(record.target) && ["href", "type", "sizes"].includes(record.attributeName) &&
            record.target.getAttribute(record.attributeName) === appliedValue(record.attributeName)) return false;
        return true;
      }
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof HTMLLinkElement && node.id !== ICON_ID && node.relList.contains("icon"));
    });
    const ownRemoved = phase() !== "idle" && settings.enabled && overlay && !overlay.isConnected;
    if (iconChanged || ownRemoved) void render();
  });
  if (document.head) headObserver.observe(document.head, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["href", "rel", "sizes", "type", "media"]
  });
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  const schemeChanged = () => { if (phase() !== "idle") void render(); };
  scheme.addEventListener("change", schemeChanged);
  const wake = () => {
    if (unread && seen()) { unread = false; lastReason = "seen"; void render(); }
    scan(); if (busy) void render();
  };
  const clicked = event => {
    const button = event.target instanceof Element && event.target.closest('button,[role="button"]');
    if (!button) return;
    if (stopReason(button)) {
      stoppedByUser = true; busy = false; unread = false; lastReason = "stopped";
      clearTimeout(idleTimer); idleTimer = null; void render();
    } else if (button.matches('[data-testid="send-button"], #composer-submit-button') && button.closest(FORMS)) {
      stoppedByUser = false; schedule();
    }
  };
  const submitted = event => { if (event.target instanceof Element && event.target.matches(FORMS)) { stoppedByUser = false; schedule(); } };
  document.addEventListener("click", clicked, true);
  document.addEventListener("submit", submitted, true);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("pageshow", wake);
  window.addEventListener("focus", wake);

  const changed = (changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    for (const key of ["color", "doneColor"]) {
      if (changes[key]) settings[key] = /^#[0-9a-f]{6}$/i.test(changes[key].newValue) ? changes[key].newValue : DEFAULTS[key];
    }
    void render();
  };
  const status = (message, _sender, reply) => {
    if (message?.type === "activity-dot:status") reply({ busy, unread, phase: phase(), enabled: settings.enabled, color: settings.color, doneColor: settings.doneColor, reason: lastReason, image: lastImage });
    return false;
  };
  try {
    chrome.storage.onChanged.addListener(changed);
    chrome.runtime.onMessage.addListener(status);
    chrome.storage.local.get(DEFAULTS).then(values => {
      if (disposed) return;
      settings.enabled = values.enabled !== false;
      for (const key of ["color", "doneColor"]) {
        if (/^#[0-9a-f]{6}$/i.test(values[key])) settings[key] = values[key];
      }
      void render();
    }).catch(() => {});
  } catch { /* Standalone DOM tests do not have extension APIs. */ }
  const handoff = () => {
    document.documentElement.setAttribute(HANDOFF_ATTRIBUTE, JSON.stringify({
      at: Date.now(), route, state: { busy, unread, reason: lastReason }
    }));
    globalThis[KEY].dispose();
  };
  globalThis[KEY] = {
    status: () => ({ build: BUILD, busy, unread, phase: phase(), reason: lastReason, image: lastImage, unreadColor: settings.doneColor }),
    dispose() {
      if (disposed) return;
      disposed = true; renderSerial++;
      window.removeEventListener(HANDOFF_EVENT, handoff);
      clearTimeout(scanTimer); clearTimeout(idleTimer);
      bodyObserver.disconnect(); headObserver.disconnect();
      scheme.removeEventListener("change", schemeChanged);
      document.removeEventListener("visibilitychange", wake);
      document.removeEventListener("click", clicked, true);
      document.removeEventListener("submit", submitted, true);
      window.removeEventListener("pageshow", wake); window.removeEventListener("focus", wake);
      try { chrome.storage.onChanged.removeListener(changed); chrome.runtime.onMessage.removeListener(status); } catch {}
      restoreIcons();
    }
  };
  window.addEventListener(HANDOFF_EVENT, handoff);
  scan();
})();
