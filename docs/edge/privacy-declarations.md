# Partner Center privacy fields — version 1.2.2

Prepared from `extension/content.js`, `background.js`, `popup.js`, the manifest, and the tests; not from the README alone. The answers below are reference material. On 29 October 2026, Partner Center confirmed that version 1.2.2 is In review. The submitted form selects User activity only, No remote code, all three limited-use certifications, and the policy URL below. The broader mapping later in this document is a conservative analysis, not an established Microsoft requirement or a record of the submitted selections.

## Single Purpose

Show ChatGPT response generation and unread completion on the ChatGPT tab's favicon in Microsoft Edge, with local color and on/off preferences.

## Permission justification

| Manifest entry | English answer |
| --- | --- |
| `scripting` | Inject the extension's bundled content.js into already-open ChatGPT tabs after installation or an extension update. Injection is limited to the two declared ChatGPT origins. This keeps existing tabs working without requiring a page reload. No downloaded scripts are injected. |
| `storage` | Store only the enabled preference and the Working and Done color values in chrome.storage.local. No conversation, account, or activity history is stored, and sync storage is not used. |
| `https://chatgpt.com/*` | Read generation-control attributes, labels and visibility, observe relevant control changes and focus, and replace or restore the tab favicon. The current conversation pathname is used only in memory to reset state on navigation. Also fetch allowlisted public favicon paths on this origin without cookies or a referrer. No message transcript or prompt text is read. |
| `https://chat.openai.com/*` | Provide the same status detection and favicon behavior on the legacy ChatGPT origin when it is available. Public image fetching is restricted to allowlisted favicon paths without cookies or a referrer. |
| `https://cdn.oaistatic.com/*` | Fetch ChatGPT's public favicon images when hosted on this CDN. No content script runs on the CDN. The worker accepts only favicon image paths, rejects query strings and redirects, limits responses to 256 KiB, and omits cookies and referrers. |

The manifest has no `tabs`, `activeTab`, `cookies`, `history`, `webRequest`, or notification permission. The limited `chrome.tabs.query` and `sendMessage` uses do not need the broad `tabs` permission. `chrome.*` is supported in Microsoft Edge; renaming it is unnecessary.

## Remote code

Selection: **No, I am not using remote code.**

Explanation, if requested: All JavaScript is bundled in the extension. No remote JavaScript, WebAssembly, eval, remote module imports, or downloaded executable code is used. Optional public favicon downloads are treated as image data, not executed as extension code. Image URLs and MIME types are validated and redirects are rejected.

## Data usage

English explanation for reviewers:

The publisher does not receive user data and has no backend or analytics. The extension locally processes generation-control metadata, focus/visibility and Stop/Send interactions, and the current ChatGPT pathname solely to show and clear the status dot. These transient values remain in tab memory; the update handoff is a short-lived DOM attribute. Only two colors and the enabled preference persist in local extension storage. Message transcripts, prompt input, account details, authentication information and general browsing history are not collected. Optional HTTPS favicon requests to chatgpt.com, chat.openai.com or cdn.oaistatic.com contain no cookies, referrer, conversation pathname, activity flags or chosen colors. The image server sees the user's IP address and ordinary request metadata. The publisher neither receives nor controls those image-server logs. There is no sale, advertising, profiling, or credit use.

### Recommended conservative checkbox mapping

The [official form illustration](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension-images/data-usage.png) groups IP addresses under **Location**, clicks under **User activity**, and text/images under **Website content**. The guide does not resolve every distinction between local access and collection. The following is a conservative disclosure of all handling, not a claim that the publisher uploads or retains these categories:

| Field | Prepared answer | Basis and limit |
| --- | --- | --- |
| Website content | Declare | Generation-control labels/attributes and favicon metadata/images are accessed locally. Conversation messages and prompt input are not read or transmitted. |
| User activity | Declare | Focus/visibility and Stop/Send interactions are used locally in memory to clear or suppress the dot. No click log, keystroke log or activity history is created. |
| Location | Declare, limited to IP exposure | A favicon request inherently reveals the IP address to the image host. The extension does not read the IP in JavaScript, use geolocation, infer a location or store an IP address. |
| Personally identifiable information | Do not declare | No names, email addresses, account IDs or identification numbers are accessed. IP exposure is disclosed in the form's Location category. |
| Health information | Do not declare | No such data is read from conversations or collected. |
| Financial and payment information | Do not declare | No payments or financial data handling. |
| Authentication information | Do not declare | No cookies, passwords, tokens or authentication APIs are accessed. Favicon fetches omit credentials. |
| Personal communications | Do not declare | Conversation transcripts and prompt text are not accessed. |
| Web history | Do not declare | No browsing-history list, visit log or general browsing monitoring. Only the current ChatGPT pathname is compared in tab memory. |

Review the current form wording before saving. Do not turn a local-processing disclosure into a statement that conversations are uploaded, or claim there are no network requests. If the form gains a separate local-only option, use it for the first two rows and keep the IP disclosure. These are prepared recommendations; the owner makes the declarations at submission.

All three limited-use certifications are supported by the audited code: no sale/transfer outside approved uses; no use/transfer unrelated to the single purpose; no use/transfer for creditworthiness or lending. The extension has no developer-controlled recipient or secondary use.

## Privacy policy URL

https://github.com/Hxtomi/ChatGPT-Status-Dot/blob/main/PRIVACY.md

The expanded policy was published on main in commit `155daa1c428f8c547ab6d7f2efa8aaffb0250cd8`. A subsequent GitHub read verified that its exact bytes match `PRIVACY.md` in the submitted 1.2.2 ZIP (SHA-256 `5d4fa835ab3d0b3146c2caa3d42231823cb72bad5e2ec152d4832d4a76c1116c`). The earlier unauthenticated HTTP check applied to the previous policy; this verification used GitHub's file interface. No private credentials belong in the listing or policy.
