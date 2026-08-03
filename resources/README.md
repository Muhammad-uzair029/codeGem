# resources/

electron-builder reads this directory (see `build.directories.buildResources`
in `package.json`) for icons + platform assets.

## Icons

Drop the following files here to override the default Electron icon:

| File          | Purpose                        | Size (recommended) |
| ------------- | ------------------------------ | ------------------ |
| `icon.icns`   | macOS app icon                 | 1024×1024          |
| `icon.ico`    | Windows installer + app icon   | 256×256 multi-size |
| `icon.png`    | Linux AppImage / .deb          | 512×512            |

The builder will pick each file up automatically when it's present.
Until then, releases ship with the default Electron logo — fine for
Tier-2 team distribution, not fine for public marketing.

## Generating icons from a single PNG

The easiest workflow:

1. Save a 1024×1024 `icon.png` in this dir.
2. Run:
   ```bash
   npx electron-icon-builder --input=./resources/icon.png --output=./resources
   ```
   That produces `icon.icns`, `icon.ico`, and resized `icon.png` variants
   the builder consumes.

## macOS entitlements (later)

When you eventually add code signing + notarization, drop an
`entitlements.mac.plist` here and point `build.mac.entitlements` at it.
Not required for the current unsigned release flow.
