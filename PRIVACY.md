# Privacy

The extension has no analytics, remote backend, or login flow. It does not request cookie, history, debugger, webRequest, native messaging, or broad all-sites permissions.

## Data used

The content script inspects control attributes, control visibility, and occasionally button text to recognize Stop controls. It observes DOM mutations but does not serialize the page or collect conversation messages. The current route is compared in memory to reset the dot when navigating to another chat. A brief DOM attribute transfers status between extension instances during reload; it contains the route, time, and indicator state, and is then removed. No account or subscription APIs are queried.

`chrome.storage.local` contains only `enabled`, `color`, and `doneColor`. It is not browser sync storage. The extension stores no conversation contents, account data, tokens, or activity logs. Removing the extension removes its local preferences according to browser behavior.

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Save the three preferences locally |
| `scripting` | Attach the content script to already-open supported tabs after installation or update |
| `https://chatgpt.com/*` | Run the indicator on ChatGPT and load allowed public favicon images |
| `https://chat.openai.com/*` | Support the legacy ChatGPT host |
| `https://cdn.oaistatic.com/*` | Load allowed public favicon images if needed |

Host access technically permits more than the limited behavior this code implements. Review the source before installing a modified distribution.

## Network

The service worker fetches only HTTPS favicon paths on the three allowed hosts. It rejects query strings, fragments, embedded credentials, non-default ports, unsupported MIME types, responses over 256 KiB, and redirects. Fetch uses `credentials: omit` and `referrerPolicy: no-referrer`. The destination still receives normal network information such as the IP address. No conversation request is made or intercepted.

The content script draws embedded images on a canvas. Remote favicon URLs from the page are passed to the worker for validation, never loaded directly. If unavailable, a generic local drawing is used.

## Reporting problems

Share browser/extension versions and a minimal reproduction. Do not post browser profiles, cookies, session exports, HAR files, real conversation links, or screenshots containing private information. Prefer synthetic examples. Review any attachment before submitting it publicly.
