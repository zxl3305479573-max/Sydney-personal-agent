# App icon source

`Sydney.icon` is the shared editable source for macOS and iOS. Its mark comes from
the earlier Sydney application and retains transparency without a baked-in plate.
Open it in Apple's Icon Composer with Xcode 26 or newer.

macOS packaging compiles the source into a Tahoe asset catalog and generates the
legacy ICNS fallback. Expo copies the same source into the iOS project.

The platform exports are:

- `apps/desktop/assets/icon-macos.png` and `apps/mobile/assets/icon.png`: transparent
  1024-pixel mark exports.
- `apps/mobile/assets/adaptive-icon.png`: transparent Android foreground.
- `apps/mobile/assets/icon-background.png`: transparent Android background layer.
- `apps/mobile/assets/monochrome-icon.png`: white alpha silhouette for themed launchers.

Refresh platform exports after changing the source. Native packaging and launcher
appearance must be checked on each target; transparency can be handled differently
by operating systems and stores.

Run `pnpm --filter @rakazo/ui-tokens export:brand` to refresh the web and marketing
favicons, install icons, marketing mark, Windows/Linux icons, and mobile assets.
The Expo notification and Android call-service exports share the same white alpha silhouette.
Apple Icon Composer output has not yet been built or validated on macOS.

After exporting, run `node apps/www/scripts/render-og.mjs` to refresh the
homepage social card. Set `CHROME_PATH` to a headless Chrome executable when
it is not available at the script's default location.
