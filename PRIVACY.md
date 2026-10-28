# Privacy — ChatGPT Status Dot

Updated: 28 October 2026. Applies to version 1.2.2 in Microsoft Edge and the shared Chromium source.

ChatGPT Status Dot is an independent extension by Hxtomi, not affiliated with OpenAI or Microsoft. The publisher operates no extension backend and receives no conversations, account details, telemetry, or usage analytics from the extension.

## Page access and local processing

On `https://chatgpt.com/` and `https://chat.openai.com/`, the extension checks generation controls (button attributes, labels, visibility, and composer button text), relevant DOM changes, the current conversation pathname, focus/visibility, and Stop/Send interactions. It reads favicon metadata and temporarily updates the page's favicon. It does not read the message transcript or prompt input, log keystrokes, monitor general browsing history, or access authentication cookies.

Working/unread state, the current pathname, and temporary icon data stay in the tab's memory. They are not sent to the publisher or another service and are reset on page reload or closure. A short-lived DOM handoff preserves indicator state when the extension is reloaded or updated; it contains only flags, the current pathname, and a timestamp, and is consumed by the replacement instance.

## Local storage and controls

Only the on/off preference and two color values are saved with `chrome.storage.local` in Microsoft Edge. The extension does not use sync storage. Turn the indicator off in its popup to stop generation monitoring, clear Working/unread state, restore the site's favicon, and prevent new favicon downloads by the extension. An image request already in flight may finish. Re-enabling checks the currently visible generation controls; it does not recover responses completed while disabled.

Reset defaults restores the default colors and enables the indicator. Removing the extension removes its local settings through the browser. Reloading or closing a chat clears its transient unread state.

## Network requests

To preserve ChatGPT's tab icon, the extension may request a public favicon over HTTPS from `chatgpt.com`, `chat.openai.com`, or `cdn.oaistatic.com`. Only allowlisted favicon paths are accepted; query strings, fragments, credentials in URLs, nonstandard ports, redirects, and arbitrary page/API URLs are rejected. Requests use `credentials: "omit"` and `referrerPolicy: "no-referrer"`. No conversation text, account identifiers, activity flags, pathname of the conversation, or chosen colors are included in these image requests.

The image server still receives the user's IP address and ordinary browser/network request metadata needed to deliver the image. The extension does not look up, store, or infer a location from the IP address. The publisher does not receive or control those servers' logs or retention. ChatGPT's own page requests and service data practices are separate; the extension does not intercept or alter them. No remote executable code, advertising, or analytics is loaded by this extension.

## Permissions

| Permission | Actual use |
| --- | --- |
| `storage` | Save the enabled preference and two colors locally |
| `scripting` | Inject the packaged content script into already-open ChatGPT tabs on install or update |
| `https://chatgpt.com/*` | Detect generation controls, update/restore favicons, and load allowed public favicons |
| `https://chat.openai.com/*` | The same functions on the legacy ChatGPT origin |
| `https://cdn.oaistatic.com/*` | Fetch only allowed public favicon images; no content script runs on this host |

The extension does not sell user data, use it for advertising or unrelated purposes, or use it to assess creditworthiness. Questions and privacy requests: [GitHub Issues](https://github.com/Hxtomi/ChatGPT-Status-Dot/issues). Do not post private conversations or credentials in a public issue.
