# Development

The extension runs directly from `extension/`; there is no build step or runtime dependency.

Load that folder through `chrome://extensions` with Developer mode enabled. After editing files, click **Reload** on the extension card.

## Tests

Requires Node.js 22 or newer.

```sh
npm test
npm run test:browser
```

The browser tests use isolated profiles and synthetic pages. Set `BROWSER_BINARY` to an extension-capable Chromium or Edge executable if it isn't found automatically. Reports and temporary profiles go in the ignored `artifacts/` directory.

## Packaging

Requires Python 3.9 or newer.

```sh
python scripts/package.py
```

Archives are written to `dist/`. `chatgpt-status-dot.zip` is the installable extension; the source archive is for development.

New files must be added to both `release-files.json` and `.gitignore` before they can be included in the repository and source archive. Release packaging rejects symlinks.
