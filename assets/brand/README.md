# GenOS brand assets

`genos-logo.png` is the canonical GenOS logo. It promotes the original Studio
hero artwork without changing its transparent layered-state design.

Use it on transparent backgrounds without recoloring, cropping, stretching, or
flattening the artwork. Keep the original aspect ratio when resizing it.

Runtime packages may carry a byte-identical copy where their packaging format
requires assets to live inside the package. Update the canonical file first,
then refresh those copies.

Current packaged copies:

- `studio/public/genos-logo.png`
- `integrations/ide/vscode/assets/genos-logo.png`
- `integrations/ide/jetbrains/resources/META-INF/pluginIcon.png`
- `integrations/ide/antigravity/assets/genos-logo.png`

`social-preview.png` is the 1280×640 repository sharing card. It composes the
canonical logo with a real Studio screenshot and does not replace the logo.
Upload it through GitHub's repository settings when preparing the public launch.
