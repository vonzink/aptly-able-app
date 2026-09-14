# App icon

## Recorder product photos

`devices/notepins.png` and `devices/notepro.png` are bundled product photos selected
by the assigned model. Identical copies live in `apps/admin/public/devices` for
the assignment form and detail panel. They are available offline in phone builds.

Sources retrieved September 14, 2026:

- [Plaud NotePin S](https://www.plaud.ai/products/plaud-notepin-s):
  `https://cdn.shopify.com/s/files/1/0918/0171/5051/files/plaud-notepin-s-black-12_143065c8-547e-47ba-b564-752d0a151b67.webp?v=1767953014&width=640`
- [Plaud Note Pro](https://www.plaud.ai/products/plaud-note-pro):
  `https://cdn.shopify.com/s/files/1/0918/0171/5051/files/NotePro-_-2_fdc31980-a483-420d-b385-3723c698c9b7.png?v=1779783768&width=640`

Both CDN responses were PNG images. They are stored as PNG without additional
image editing. The pictured finish illustrates the model; the app does not
currently collect a recorder color choice.

## Icon provenance

`app-icon.png` is the shared iOS/Android icon configured in `app.config.ts`. It uses the blue lowercase-a/elephant symbol on opaque white, adapted from the existing `aptly-able-logo.png` wordmark. The original wordmark remains unchanged. Expo generates the platform-specific icon sizes and iOS applies its own corner mask.

Created on 2026-09-11 with the built-in image-generation tool, using the existing wordmark as the edit target. The resulting source is a 1254 × 1254 opaque PNG; Expo's generated iOS asset is 1024 × 1024. The user approved the displayed adaptation.

Prompt:

> Use case: precise-object-edit. Create a production mobile app icon, 1024 by 1024 square PNG, from the supplied existing Aptly Able logo. This is a faithful brand asset adaptation, not a logo redesign. Extract ONLY the blue lowercase-a symbol with the elephant silhouette at the far left of the reference; omit the AptlyAble wordmark to the right. Preserve the original symbol's exact contours, elephant trunk, head, eye and the lowercase a silhouette. The dark/transparent negative spaces of the source should be solid white. Center the complete symbol, keeping its original aspect ratio, on a pure opaque white square. Symbol height about 740px with generous balanced margins for OS icon masks. Use the original flat navy blue approx #1A4164. Absolutely no black fill, no gradients, no shadows, no bevels, no rounded outer corners, no additional symbols, no lettering, no mockup of a phone. Deliver the flat usable app icon asset.
