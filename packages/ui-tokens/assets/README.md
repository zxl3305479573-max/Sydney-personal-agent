# App icon source

`Sydney.icon` is the shared editable source for macOS and iOS. Its mark comes from
the earlier Sydney application and retains transparency without a baked-in plate.
Open it in Apple's Icon Composer with Xcode 26 or newer. The old `Rakazo.icon`
is retained for the upstream avatar resources.

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
The notification export uses a white alpha silhouette; no background is added.
Apple Icon Composer output has not yet been built or validated on macOS.

After exporting, run `pnpm exec tsx apps/www/scripts/render-og.mjs` to refresh the
marketing page social cards; set `CHROME_PATH` to a headless Chrome executable when
it is not available at the script's default location.

## Animated vector avatars

The animated Rakazo avatar uses SVG paths and gradients in the shared
`logo-avatar-art.ts` definition. Its contour is sampled from this canonical
source's alpha silhouette. The hands and lighting are simplified vector shapes;
the original photographic skin grain is intentionally not reproduced. No raster
body is embedded or loaded by the vector renderer. The canonical icon and its
platform exports remain unchanged.
