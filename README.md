# ChatGPT Status Dot

A small dot on the tab icon tells you when ChatGPT is working and when a response finished in the background. No dashboard, account, or backend.

| State | Default color | When it clears |
| --- | --- | --- |
| Working | Blue `#91ACF2` | Work finishes or you press Stop |
| Done | Green `#65D6A0` | You return to the finished chat |
| Idle | Original icon, no dot | — |

If a response finishes in the visible, focused tab, the dot clears immediately after the completion debounce. Each tab has independent state. Change either color, disable the indicator, or reset defaults in the extension popup.

## Install

1. Download `chatgpt-status-dot-1.1.0-extension.zip` from the [latest release](https://github.com/Hxtomi/ChatGPT-Status-Dot/releases/latest) and extract it into a permanent folder.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode**, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.

If you download the source archive or clone this repository instead, select its `extension` subfolder. No build step, account, or API key is required.

The extension attaches to existing ChatGPT tabs without reloading chats. After updating its files, use **Reload** on the extension card. Use only one Status Dot installation at a time.

Google Chrome is the primary release target. The maintainer confirmed basic operation on live ChatGPT in Chrome on September 29, 2026 (UTC+05:00). Automated integration tests also pass in Microsoft Edge on synthetic ChatGPT pages. The code uses Manifest V3 and targets Chromium 120 or newer; other browsers are not claimed as supported. See [VALIDATION.md](VALIDATION.md) for the scope of testing. There is no Chrome Web Store listing yet.

## How it works

A content script observes visible generation/task Stop controls, using structural identifiers and English/Russian labels. A short 500 ms debounce avoids flicker between thinking, tools, and answering. It temporarily updates favicon links and restores their original attributes when the indicator clears. It does not modify messages, the composer, or the site's Thinking label.

This is a page indicator, not a server health monitor. A stalled response may still appear Working. A discarded or frozen tab cannot report fresh state. ChatGPT interface changes or other languages may require detector updates. A page reload resets in-memory unread state. Advanced Thinking/Stopped/Sending colors are not part of this release.

## Privacy

- No analytics, backend, API keys, cookie access, or interception of conversation requests.
- Only three preferences are persisted locally: enabled, Working color, and Done color.
- Busy/unread state and generated icons stay in memory; no conversation text, conversation URLs, or account details are saved.
- The only extension-initiated network fetch is an allowed public favicon from a ChatGPT host or `cdn.oaistatic.com`, with credentials omitted and no referrer. URLs with query strings, fragments, credentials, unusual ports, or non-favicon paths are rejected. Failed loads use a generic chat icon.

See [PRIVACY.md](PRIVACY.md) for permissions and limitations.

## Development

There are no runtime or npm dependencies. Node.js 22 or newer runs the tests:

```sh
npm test
npm run test:browser
```

Browser tests default to common Edge locations on Windows or Chromium on Linux. Set `BROWSER_BINARY` if needed. The executable must support loading unpacked extensions through command-line flags. Tests launch their own isolated browser, use synthetic pages without signing in, and store generated artifacts under `artifacts/`. They never attach to a personal browser.

Build the two archives with Python 3:

```sh
python scripts/package.py
```

The builder reads exact files listed in `release-files.json`, refuses symlinks, and creates a source ZIP and an extension-only ZIP in `dist/`. Browser profiles, reports, Git history, screenshots, and other workspace files are not included. Review the allowlist and both archives before publishing.

## License

[Apache License 2.0](LICENSE). Copyright 2026 Hxtomi. Preserve the applicable license and attribution notices when distributing derivatives; see [NOTICE](NOTICE) and the license for the full terms.

Independent project. Not affiliated with OpenAI, Google, or Microsoft.
