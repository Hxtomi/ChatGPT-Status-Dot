# Development

The extension runs directly from `extension/`; there is no build step or runtime dependency.

In Microsoft Edge, load that folder through `edge://extensions` with Developer mode enabled. After editing files, click **Reload** on the extension card. The same source can be loaded through another Chromium browser's extensions page.

## Tests

Requires Node.js 22 or newer.

```sh
npm test
npm run test:browser
```

The browser tests use isolated profiles and synthetic pages. Set `BROWSER_BINARY` to an extension-capable Chromium or Edge executable if it isn't found automatically. Reports and temporary profiles go in the ignored `artifacts/` directory.

PowerShell example for Edge (use the path actually installed on your machine):

```powershell
$env:BROWSER_BINARY = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm test
npm run test:browser
npm run test:live
```

`test:live` probes the real site in a clean Edge profile without bypassing human verification. It deliberately returns a nonzero exit code when live generation has not been verified. Its report and access screenshot are diagnostic artifacts, not store screenshots. Complete [the live checklist](edge/live-check.md) before submission. Synthetic tests alone never certify the current ChatGPT website.

## Packaging

Requires Python 3.9 or newer.

```sh
python scripts/package.py
```

Archives are written to `dist/`. `chatgpt-status-dot.zip` is the installable extension; the source archive is for development.

New files must be added to both `release-files.json` and `.gitignore` before they can be included in the repository and source archive. Release packaging rejects symlinks.

The packager also rejects version drift between the manifest, `package.json`, and content-script `BUILD`, an `update_url`, missing runtime resources, and incorrectly sized PNG icons. The installable ZIP excludes tests, development scripts, store assets, and browser profiles, while retaining `LICENSE`, `NOTICE`, and `PRIVACY.md`.

Additional packaging regressions and an independent extraction check:

```powershell
python -m unittest discover -s tests -p package_test.py
python scripts/verify-package.py
$env:BROWSER_EXTENSION_DIR = (Get-Content artifacts/package-verification.json -Raw | ConvertFrom-Json).extracted
npm run test:browser
Remove-Item Env:BROWSER_EXTENSION_DIR
```

The last browser run then loads the exact extracted release. `BROWSER_EXTENSION_DIR` is also respected by the upgrade test, which copies it into its own temporary profile before deliberately altering the test copy.

Optional artwork regeneration: `python scripts/make-icons.py` requires Pillow only on the development machine. It produces the four packaged icons and the separate 300×300 store logo. It adds no dependency to the extension or release packaging.
