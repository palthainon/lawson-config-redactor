# Reuse the redactor tests

Run these commands from the repository root.

1. Run `npm ci` to install the development dependencies.
2. Run `npm test` to compile the extension and run the automated tests.
3. Run `npm run test:host` to check the extension in the isolated test editor. The first run downloads the editor.

| File | Purpose |
| --- | --- |
| `cisco.test.js` | Check credential removal and address replacement. |
| `core.test.js` | Check scanner rules, manual masks, review state, and file protection. |
| `worker.test.js` | Check scanning and cancellation. |
| `host.js` | Check editor commands, comparisons, clipboard output, and file output. |
| `fixtures/cisco-labs.ios` | Provide the reusable Cisco lab input with synthetic secrets. |
| `fixtures/encoded.json` | Provide synthetic encoded password values. |
| `fixtures/SOURCES.md` | Record the public source documents. |

Add reusable input files to `fixtures`. Add checks to the applicable test file. Use synthetic secrets. Keep customer configurations and live credentials out of this folder.
