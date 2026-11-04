# Desktop icons

The shared editable source and export notes are in
[`packages/ui-tokens/assets`](../../../packages/ui-tokens/assets/README.md).

Mac packaging requires Xcode 26 or newer. Electron builder compiles `Sydney.icon`
into `Assets.car` for Tahoe and generates `icon.icns` for older macOS versions.
`icon-macos.png` is the transparent development export.

`icon.png` and `icon.ico` are matching transparent exports for Linux and Windows.
Refresh them with `pnpm --filter @rakazo/ui-tokens export:brand`.
