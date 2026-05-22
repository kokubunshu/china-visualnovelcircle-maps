# Changelog

## 1.6.6 - 2026-05-23

This release introduces the Star Map system (联合星图), a standalone User Center page, comprehensive browser caching, theme/image performance upgrades, and login-page visual overhaul.

### Added

- Added the Star Map (`star_map.html`) with a redesigned union star map: always-expanded mode, core-member orbital layout with dashed connection lines, member hover/click interactions, and full-view drag-and-pan.
- Added PHP API for star union management (`api/star_unions.php`) covering list, get, create, update, delete, and member add/remove operations.
- Added a standalone User Center page (`user.html`).
- Added database migration for `star_unions` and `star_union_members` tables in `scripts/migrate.php` (MySQL + SQLite).
- Added browser cache-control headers in `.htaccess`: 1-year immutable cache for images (avif/gif/ico/jpeg/png/svg/webp), 1-day cache for CSS/JS, with mod_expires support.
- Added inline theme preloading script to both `index.html` and `login.html` to prevent flash-of-wrong-theme.
- Added star map mode button (`data-mode="starmap"`) to the mode-switch tabs on the main page.
- Added `goUserCenter()` navigation helper and converted account buttons from `<button>` to `<a href="./user.html">` for direct linking.
- Added media preloading (`preloadMediaUrl`) and lazy image enhancement (`enhanceImages`) with a MutationObserver in `js/app-core.js`.
- Added wallpaper system upgrades in `page-background.js`: mobile/touch-device disabling, reentrancy guard, and responsive `matchMedia` change listener.
- Added contract test assertion for eager-loading avatar crop image.

### Changed

- Login page (`login.html`) complete visual overhaul: replaced brand symbol (text "VN" → logo image), updated button styles to glass-like with border, removed hard-coded `data-theme="dark"`, added theme preloading and `colorScheme` sync.
- Admin reviews page (`admin/reviews.html`): color contrast improvements (replaced `#999`/`#666` with `#475569`/`#374151`), removed opacity on approved/rejected cards, added button styles, removed wallpaper script.
- CSS (`styles.css`): mode-tab flex layout fix (now fills container evenly), narrow-desktop breakpoint (≤800px), display-switch responsive refinements, user card layout improvements.
- Theme-color meta tags now properly scope to `(prefers-color-scheme: dark)` media query; `updateThemeMetaColor` now updates all non-media-scoped meta tags.
- Image upload flows (club avatar, user avatar, event image, publication image) now use `preloadMediaUrl` for better loading performance.
- Calendar event image upload also uses `preloadMediaUrl`.
- All wiki pages (11 files) removed the wallpaper script tag.

### Fixed

- Fixed `page-background.js` infinite re-init risk by adding `initStarted` guard.
- Fixed `login.html` initial theme flash by adding synchronous theme preloading before render.
- Fixed missing Chinese/Japanese translations for "星图" mode label in `app.js`.

### Verification

- `npm run check`
- `node --check js/app-core.js`

This release focuses on the public-facing VNFest experience, the Moe Contest workflow, and GitHub upload hygiene.

### Added

- Added a default login-first entry flow with a redesigned login page.
- Added forgot-password support to the local account flow.
- Added a shared wallpaper system for login and secondary pages, with local wallpapers discovered from `/image/background`.
- Added main-page wallpaper styling for both map mode and list mode.
- Added a public Moe Contest portal under `moe/`.
- Added a Moe Contest manager page for contest owners and administrators.
- Added Moe Contest APIs for contests, stages, candidates, matches, and votes.
- Added standard Moe Contest stages, including nomination, qualifier, bracket, and a separate final stage.
- Added 1v1 bracket advancement, final-stage advancement, stage settlement, and public bracket rendering.
- Added contest deletion support with dependent vote/stage/candidate cleanup.
- Added Bangumi subject and character proxy helpers for nomination workflows.
- Added contract tests for Moe Contest backend, manager UI, and public UI.

### Changed

- Main page now loads the map first, then applies wallpaper effects after the map has actually rendered.
- List mode now shares the same wallpaper and glass-panel visual language as map mode.
- Stage defaults are editable instead of being locked to fixed presets.
- Moe Contest schedule/result pages were redesigned around smaller adaptive modules and connected tournament structure.
- Login copy now uses “回到你的同好会。” and removes the coordinate-themed language.
- Local wallpaper fallback now uses the tracked site image asset, while `/image/background` stays available as a local drop folder.
- `.gitignore` was reorganized to exclude local config, runtime data, user uploads, cache, logs, build output, and private wallpaper files.
- Runtime JSON data such as events, publications, manuscripts, and registrations was removed from Git tracking while remaining on disk locally.

### Fixed

- Fixed wallpaper loading order regressions caused by treating an empty `#mapSvg` as a rendered map.
- Fixed main-page wallpaper script caching by adding explicit versioned script URLs.
- Fixed secondary/detail wallpaper changes that were no longer part of the desired scope by rolling them back.
- Improved privacy handling in auth-related flows and expanded backend privacy contract checks.

### Verification

- `npm run check`
- `node --check js/page-background.js`

## 1.6.4

Baseline release before the Moe Contest, login wallpaper, and upload-hygiene work. It included map/list navigation, club detail management, Wiki generation, activity/publication workflows, and backend privacy contract coverage.
