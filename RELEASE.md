# Marketplace release

The public source repository is [palthainon/lawson-config-redactor](https://github.com/palthainon/lawson-config-redactor). The default branch is `main`.

Version 0.3.0 uses publisher `DerickL` and extension name `lawson-config-redactor`. It remains marked Preview. The license is MIT. The company banner color is `#3a2414`. The manifest requests the local desktop extension host.

The root `README.md` supplies the Marketplace description. `PRIVACY.md` states the data handling boundary. `SUPPORT.md` gives the support route. `CHANGELOG.md` records the release history. `LICENSE` contains the MIT terms.

The company logo is `media/logo.png`. Both screenshots use synthetic input from `samples/marketplace-demo.ios`. They show the real desktop extension. The README source uses relative image paths. The package tool rewrites them to public HTTPS URLs.

The `vsce.baseImagesUrl` setting pins the images to source commit `72f3654792fc9cfbc2255cd0892bea41dc281f88`. This keeps the listing images stable when the default branch changes. The release check downloads each public image without authentication. It checks the content type and compares its hash with the local asset.

## Repeat the release checks

Run these commands from the repository root:

```text
npm ci
npm test
npm run test:host
node scripts/check-release.js
npx @vscode/vsce package --no-dependencies --out lawson-config-redactor-0.3.0.vsix
```

The upload package is `lawson-config-redactor-0.3.0.vsix`. The earlier `lawson-config-redactor-0.3.0-local-preview.vsix` keeps relative image paths for local review. Use the upload package for the Marketplace.

Inspect the packaged README, public image URLs, company license, and runtime files before upload. Tests, development scripts, release notes for maintainers, and configuration captures must stay out of the package. The two synthetic examples are intentional package content.

## Publication boundary

Derick approved the public repository and screenshot upload on 2026-10-23. Marketplace publication remains separate. Confirm publisher account access and publication approval before uploading the reviewed package. This repository has no automatic Marketplace publication workflow.

## References

- [Microsoft publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension): image URLs, packaging, and publication.
- [Microsoft manifest reference](https://code.visualstudio.com/api/references/extension-manifest): icon, banner, keywords, Preview label, and extension host location.
- [MIT terms](https://opensource.org/license/mit): the release license.
