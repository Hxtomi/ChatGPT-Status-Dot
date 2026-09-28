"use strict";
(async () => {
  const defaults = { enabled: true, color: "#91ACF2", doneColor: "#65D6A0" };
  const enabled = document.getElementById("enabled");
  const status = document.getElementById("status");
  const colors = ["color", "doneColor"];
  const settings = await chrome.storage.local.get(defaults);
  enabled.checked = settings.enabled !== false;
  for (const key of colors) {
    const input = document.getElementById(key);
    input.value = /^#[0-9a-f]{6}$/i.test(settings[key]) ? settings[key] : defaults[key];
    input.addEventListener("change", async () => {
      try { await chrome.storage.local.set({ [key]: input.value }); }
      catch { status.textContent = "Could not save settings. Reopen this popup to retry."; }
    });
  }
  async function refresh() {
    if (!enabled.checked) { status.textContent = "Indicator disabled"; return; }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await chrome.tabs.sendMessage(tab.id, { type: "activity-dot:status" });
      status.textContent = result.busy ? "Working" : result.unread ? "Done — waiting for you" : "No active generation";
    } catch { status.textContent = "Open a ChatGPT tab to see its status"; }
  }
  enabled.addEventListener("change", async () => {
    try { await chrome.storage.local.set({ enabled: enabled.checked }); await refresh(); }
    catch { status.textContent = "Could not save settings. Reopen this popup to retry."; }
  });
  document.getElementById("reset").addEventListener("click", async () => {
    try {
      await chrome.storage.local.set(defaults);
      enabled.checked = true;
      for (const key of colors) document.getElementById(key).value = defaults[key];
      await refresh();
    } catch { status.textContent = "Could not reset settings. Reopen this popup to retry."; }
  });
  await refresh();
})().catch(() => { document.getElementById("status").textContent = "Could not load settings. Reopen this popup to retry."; });
