# Release validation — 1.1.0

Validated on 2026-09-28. Public product name: **ChatGPT Status Dot**.

## Executed checks

| Check | Result | Environment |
| --- | --- | --- |
| Favicon URL boundary, sender validation, MIME/size/failure handling, manifest scope | 18/18 passed | Node.js 24.19.0 |
| Idle/Working/Done, actual browser favicon, Stop, debounce, independent tabs, reinjection, color changes, popup reset, navigation | 16/16 passed | Microsoft Edge 154.0.4258.37, Node.js 22.23.2, Windows |
| Extension reload, script registration, existing and fresh tabs | 3/3 passed | Same Edge environment |

Browser checks load the real unpacked extension in a new isolated browser profile and intercept page navigation with synthetic fixtures. They do not sign into an account. Both browser reports recorded zero page-level external requests. Service-worker fetch behavior is additionally tested with controlled responses in the Node tests; those tests are not a general network capture of the browser.

On September 29, 2026 (UTC+05:00), the maintainer reported that the unpacked extension works on live ChatGPT in Google Chrome after following the installation and manual test instructions. The exact Chrome version and individual manual case results were not recorded. This is maintainer-reported confirmation, separate from the automated Edge checks. These results do not guarantee every ChatGPT interface variant or server-side completion. The final display name is ChatGPT Status Dot. Defaults are blue Working (`#91ACF2`) and green Done (`#65D6A0`). The browser cases were rerun with these defaults, including exact rendered pixel colors and popup reset.

## Publication review

This distribution is assembled from an explicit allowlist, independently of the private development workspace. It includes only source, synthetic tests, documentation, the license, and a packaging script. No existing Git history is imported.

Excluded: browser profiles, cookies, account/session databases, diagnostic pages and exports, test reports, caches, local installation instructions, machine paths, screenshots, and unrelated projects. Original browser-profile contents were not audited and are not claimed safe to publish.

Reviewed the extension's complete source and its storage/network paths. No embedded credentials, account/subscription snapshots, conversation exports, or user-specific local paths were found in the release files. This is a bounded source/release review, not a forensic audit of the user's computer or a guarantee about future contributions.

The release builder verifies the exact ZIP member list and byte equality against the allowlisted files. File timestamps and permissions in the ZIP are normalized. The deny-by-default `.gitignore` offers a second safeguard; it does not replace review or remove files already tracked by Git.
