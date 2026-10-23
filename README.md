# Network Config Redactor — Lawson Cyber LLC

Prepare one Cisco IOS or IOS-XE configuration for technical review. The extension replaces supported sensitive values with consistent named placeholders. The engineer reviews a comparison before copying or saving the output.

The output is review text. Do not deploy it to a device. Unknown sensitive content can still remain. Review the full comparison before export.

## Use the prototype

1. In Visual Studio Code, run **Extensions: Install from VSIX**. Select the local prototype package.
2. Open a configuration, or run **Lawson Cyber: Open Redactor Demo** for synthetic input.
3. Run **Lawson Cyber: Preview Redacted Configuration**.
4. Select **Open comparison**. Review the original snapshot and the proposed output.
5. If a section blocks export, select **Mask this section**. If detection missed other content, select that content in the original source. Run **Lawson Cyber: Redact Selected Text**.
6. Open the updated comparison. Confirm the review checkbox.
7. Select **Copy redacted text** or **Save redacted copy**.

Saving requires a new local filename. The suggested name is `redacted-config.txt`. Existing files, including the source, cannot be overwritten. A cancelled save writes nothing. Source edits invalidate the preview. A new scan resets manual masks.

## Detection coverage

The scanner supports enable and user passwords and secrets, line passwords, SNMP community and user authentication values, legacy and named authentication server keys, key chain values, time authentication keys, routing passwords, selected routing authentication forms, and shared keys. Plaintext and encoded values are opaque text. The scanner does not decrypt them.

SNMP authentication rules preserve recognized protocol options and ports. Certificate bodies and encoded key bodies are opaque. Unsupported sensitive forms and incomplete blocks require a manual mask before export.

The scanner also replaces configured hostnames, domains, usernames, IPv4 and IPv6 addresses, MAC addresses, declared object names, and exact token references. Names must differ from command keywords. Unsupported identifiers, unknown hostnames, addresses embedded in arbitrary expressions, and data outside the supported command forms need an engineer's review.

Masks and prefix lengths remain visible where the command syntax identifies them. Descriptions, remarks, comments, contact and location fields, and banner content are redacted by default. The extension preserves indentation, line endings, and line count. Placeholder numbering follows source order within each category. Identical values share a label within that category.

## Data handling

The extension makes no network requests. The About button opens the company website only when selected. The extension runs no device commands and uses no external analysis service or telemetry.

Source snapshots, original values, and mappings stay in extension memory. Closing the review clears its state and closes its comparison tabs. The review panel receives labels, categories, rule names, and line references. It does not receive original values. Only the selected export action writes output or changes the clipboard.

The input limit is 5 MiB. Scanning runs in a worker that can be cancelled. The extension supports local files and unsaved documents in desktop Visual Studio Code. The source document remains editable in its normal editor.

## Development

Run `npm ci`, then `npm test`. Run `npm run test:host` for tests in an isolated official Visual Studio Code 1.102.0 copy. The test runner downloads that copy on its first run. The runner does not change the installed editor.

Run `npx @vscode/vsce package --allow-missing-repository --skip-license --no-dependencies` to build the local package. The extension has no runtime dependencies. Release licensing and Marketplace publication remain separate decisions.

The samples contain synthetic values and documentation addresses. They contain no customer configurations or live credentials. Syntax references came from the existing Cisco highlighting grammar and the local Cisco syntax reference. The virtual document implementation follows the [Visual Studio Code documentation](https://code.visualstudio.com/api/extension-guides/virtual-documents).
