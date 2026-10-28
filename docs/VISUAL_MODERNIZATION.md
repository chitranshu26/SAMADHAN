# SAMADHAN visual modernization

This update is limited to presentation. It builds on the existing shared administrative stylesheet and does not replace the application.

## Main files
- `src/app/government.css`: shared public/auth/dashboard design system, responsive forms, tables, cards, case workspaces, dialogs, notifications, restrained motion, print and reduced-motion styles.
- `src/components/brand-intro.tsx`: session-once decorative Three.js GLB reveal, local Draco decoder, centred camera framing, soft lighting, image fallback, interaction dismissal and resource disposal. The existing application mounts immediately underneath; the intro intercepts no clicks or keyboard events.
- `src/components/ui.tsx`: supplied emblem and project strapline in shared branding.
- `src/components/auth.tsx`: supplied emblem in the decorative authentication illustration.
- `src/app/page.tsx`: supplied full logo in the landing page visual.
- `src/components/charts.tsx`: branded chart palette only; calculations, chart series, click actions and data unchanged by this visual update.
- `src/app/layout.tsx`: presentation layer, intro and icon metadata.
- `package.json` and lockfile: Three.js and its TypeScript definitions for GLB rendering.

## Original assets
`public/branding/samadhan-original.png` and `samadhan-logo.glb` preserve the supplied files. The GLB was sourced from the matching `users_xRYoOHooAvWvvW74thUbBnyaLkl1_assets_5d8824038116cc00e0ed66787b21763d_model.glb` file in Downloads. Its texture contains the matching gold, blue, green and teal educational emblem. Optimized WebP variants retain the supplied colours. The symbol crop omits tiny wordmark text for small icons.

Generated icons: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, and `android-chrome-512x512.png`. Existing SVG assets remain available. Three.js licence and local Draco decoder files accompany the renderer assets. No externally hosted script or decoder is required at runtime.

## Coverage and boundaries
The shared presentation layer covers the landing page; login, registration, verification, password recovery/reset and tracking; all six existing role workspaces; dashboards and analytics; complaint lists, submission and details; duplicates; institution directory; replay; notifications; reports; account settings and administration. Navigation destinations, existing role checks, handlers, form payloads, backend APIs, database schemas and deployment settings were not modified by this design update. Previously existing uncommitted functional changes are separate from this visual work.

The logo's embedded AICTE artwork is user-supplied; no claim of authorization or endorsement has been added. Existing independent-demo notices remain, including one on the startup identity.

## Limitations
Testing, building, linting, and automated verification were not performed as requested.
No development server or browser verification was started. Runtime appearance and compatibility have not been verified. No deployment was triggered. No video renderer was available on PATH, so no MP4/WebM export was generated; the actual GLB-based browser implementation and image fallback are provided instead. No compliance certification is claimed.

## Supplied asset follow-up
The homepage now also renders the supplied GLB persistently in `src/components/brand-model.tsx`, with a gentle entrance and mouse-position tilt. Rendering pauses offscreen and when the tab is hidden, and stops after the entrance until interaction or resize. The additional supplied `bc5808df-4517-4981-9b3b-6e8f3ea4356b.png` is retained as `public/branding/samadhan-model-poster.png` and displayed when reduced motion is requested or WebGL/model loading is unavailable. The original high-resolution emblem continues to supply navigation, authentication and icon branding. No tests or builds were performed for this follow-up.

## Additional scoped enhancement (latest brief)
- Added `src/app/portal-polish.css` for typography, spacing, buttons, navigation, forms, case tables, authentication and public pages.
- `Workspace` now exposes a presentation-only `visual-eligible` class outside `/analytics` and `/dashboard`. All new workspace CSS requires that class; both dashboard routes retain their existing styling. Analytics source files, chart settings, calculations, filters and datasets were left unchanged in this follow-up.
- Updated `BrandIntro` to render its initial full-screen identity immediately rather than waiting for an effect to make it visible. The actual supplied GLB still loads with local Draco decoding and lighting, followed by a bounded fade-out. Previously seen sessions, storage restrictions and reduced-motion preferences dismiss it. Underlying application children mount normally and no authentication/API readiness dependency was introduced.
- Added explicit mobile/tablet refinements and reduced-motion rules scoped to eligible interfaces. No new routes, controls or application workflows were introduced.
- Original PNG/GLB files and favicon variants from the prior update remain integrated.

Testing, building, linting, and automated verification were not performed as requested. No deployment configuration or backend files were changed in this follow-up. Runtime appearance has not been verified.
