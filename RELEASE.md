# Marketplace preparation

The listing targets engineers who prepare Cisco configurations for peer review. Its main claim is local processing. The requested first action is to open the synthetic demo. The About view provides the company website route. No claim of customer adoption is made.

## Prepared files

The root `README.md` is the proposed Marketplace description. `PRIVACY.md` states the data handling boundary. `SUPPORT.md` gives the support route. `CHANGELOG.md` records the release history. `LICENSE` contains the approved MIT terms.

The existing 400 by 400 pixel company logo is `media/logo.png`. The two editor captures are `media/screenshots/named-labels.jpg` and `media/screenshots/new-addresses.jpg`. Both captures use `samples/marketplace-demo.ios`. The original values are synthetic. The captures show the real desktop extension.

Version 0.3.0 retains publisher `DerickL` and extension name `lawson-config-redactor`. The first listing remains marked Preview. The company banner color is `#3a2414`. The manifest requests the local desktop extension host.

## Local review

Run these commands from the repository root:

```text
npm ci
npm test
npm run test:host
node scripts/check-release.js --local
npx @vscode/vsce package --allow-missing-repository --no-rewrite-relative-links --no-dependencies --out lawson-config-redactor-0.3.0-local-preview.vsix
```

The local preview includes screenshots and retains relative image paths. It is for local review. It is not the upload package.

## Remaining release steps

1. Approve a public location for the screenshots. No accessible public repository is currently configured for this project. The local repository has no remote.
2. Upload only the approved listing assets, or publish the approved source repository. Keep configuration inputs and private review data out of the upload.
3. Set `vsce.baseImagesUrl` in `package.json` to the approved HTTPS base URL. The base must preserve the relative `media/screenshots/` paths in the README.
4. Run `node scripts/check-release.js`. It requires both screenshot URLs to return image content. The check does not read configurations.
5. Build the upload package with relative link rewriting enabled. Use `npx @vscode/vsce package --allow-missing-repository --no-dependencies --out lawson-config-redactor-0.3.0.vsix`.
6. Inspect the packaged README and image URLs. Confirm the package contains the company license and no tests, development notes, or configuration captures.
7. Confirm publisher access, the final name, and publication approval. Upload only the reviewed package through the publisher account.

No publisher login, public asset upload, repository upload, or Marketplace publication occurs during preparation.

## References

- [Microsoft publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension): README image URLs must resolve to HTTPS URLs. The packaging tool can rewrite relative links with a repository URL or a configured image base.
- [Microsoft manifest reference](https://code.visualstudio.com/api/references/extension-manifest): icon, banner, keywords, Preview label, and extension host location.
- [MIT terms](https://opensource.org/license/mit): the approved release license.
