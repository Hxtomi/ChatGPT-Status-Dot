"use strict";
(async () => {
  const defaults = { enabled: true, color: "#91ACF2", doneColor: "#65D6A0" };
  const enabled = document.getElementById("enabled");
  const status = document.getElementById("status");
  const reset = document.getElementById("reset");
  const colors = ["color", "doneColor"];
  const settings = await chrome.storage.local.get(defaults);

  function showStatus(text, state = "idle") {
    status.textContent = text;
    status.parentElement.dataset.state = state;
  }
  function preview() {
    document.body.dataset.enabled = String(enabled.checked);
    document.documentElement.style.setProperty("--working", document.getElementById("color").value);
    document.documentElement.style.setProperty("--done", document.getElementById("doneColor").value);
  }
  enabled.checked = settings.enabled !== false;
  for (const key of colors) {
    const input = document.getElementById(key);
    input.value = /^#[0-9a-f]{6}$/i.test(settings[key]) ? settings[key] : defaults[key];
    settings[key] = input.value;
    input.disabled = false;
    input.addEventListener("input", preview);
    input.addEventListener("change", async () => {
      input.disabled = true;
      try {
        await chrome.storage.local.set({ [key]: input.value });
        settings[key] = input.value;
        preview();
        await refresh();
      } catch {
        input.value = settings[key];
        preview();
        showStatus("Couldn't save this color. Try again.", "error");
      } finally { input.disabled = false; }
    });
  }
  async function refresh() {
    if (!enabled.checked) { showStatus("Indicator is off", "off"); return; }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await chrome.tabs.sendMessage(tab.id, { type: "activity-dot:status" });
      if (result.busy) showStatus("ChatGPT is working", "working");
      else if (result.unread) showStatus("Response ready", "done");
      else showStatus("No response in progress");
    } catch { showStatus("Open a ChatGPT tab to see its status"); }
  }
  enabled.disabled = false;
  enabled.addEventListener("change", async () => {
    enabled.disabled = true;
    preview();
    try {
      await chrome.storage.local.set({ enabled: enabled.checked });
      settings.enabled = enabled.checked;
      await refresh();
    } catch {
      enabled.checked = settings.enabled !== false;
      preview();
      showStatus("Couldn't save this setting. Try again.", "error");
    } finally { enabled.disabled = false; }
  });
  reset.disabled = false;
  reset.addEventListener("click", async () => {
    reset.disabled = true;
    try {
      await chrome.storage.local.set(defaults);
      Object.assign(settings, defaults);
      enabled.checked = true;
      for (const key of colors) document.getElementById(key).value = defaults[key];
      preview();
      await refresh();
    } catch { showStatus("Couldn't reset your colors. Try again.", "error"); }
    finally { reset.disabled = false; }
  });
  preview();
  await refresh();
})().catch(() => {
  const status = document.getElementById("status");
  status.textContent = "Couldn't load settings. Reopen this window to retry.";
  status.parentElement.dataset.state = "error";
});
