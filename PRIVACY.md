# Data handling

Network Config Redactor processes one configuration in the local desktop extension host. The extension makes no network requests. It has no telemetry, cloud analysis, AI service, or device connection.

The scanner reads the active local text document, including unsaved changes. The source snapshot, scan results, selected masks, and replacement mappings stay in extension memory. Closing the review clears its state. The extension writes no source logs, mapping files, or review history.

The comparison uses read-only virtual documents. Document identifiers contain random identifiers and fixed filenames. They contain no source text. The review panel receives replacement values, categories, rule names, line references, and review state. It does not receive the original source or the mapping from original values.

Only the selected export action changes the clipboard or writes an output file. A saved copy requires a new filename. The source file cannot be overwritten. A source edit invalidates the preview and blocks export until another scan and review.

Selecting the website button opens `https://lawsoncyber.com` in the user's browser. It sends no configuration content. The browser can make its normal website requests.

This document describes the extension. It does not govern Visual Studio Code, other extensions, the operating system, backup tools, file sync software, or a recipient of exported text. The extension does not provide secure memory erasure or complete detection of unknown sensitive content.
