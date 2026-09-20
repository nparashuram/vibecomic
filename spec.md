# Comic Builder — Engineering Spec

This is the full design document. The short user-facing overview lives in
`README.md`. The agent-facing runtime API reference is `ComicBuilder.help()`
in the browser console and the static copy in `public/llms.txt`.

## 1. Architecture

Comic Builder is a **static single-page app** (Vite + React + TypeScript)
deployed to GitHub Pages. It has no server and no database of its own.

```
Browser (React UI) ──window.ComicBuilder──> state (React useState + refs)
        │                                          │
        │ actions.ts delegates                     │ every 60s, if changed
        ▼                                          ▼
Google Drive API ◄── OAuth token (page memory) ── saveProjectJson()
```

- **One code path.** The UI and any AI agent call the same functions on
  `window.ComicBuilder` (installed by `src/ai/actions.ts`'s
  `installComicBuilder(deps)` in `App.tsx`). Buttons never contain their own
  mutation logic, so the UI can't drift from the agent API.
- **React is the view layer; the API is the model.** `App.tsx` keeps the
  project in `useState` plus mirrors in `useRef` so the installed API
  closures never go stale. `updateProject(mut)` clones the project,
  applies the mutation, stamps `updatedAt`, sets state, and marks the
  project as having unsaved changes.
- **Drive is the only store.** There is no local-storage copy of the comic.
  `drive.file` scope means the app can only see folders/files it created.

## 2. Screens

`App.tsx` has exactly three screens plus one overlay:

1. **Splash** (`splash`) — hard gate. Title "Connect to Google Drive",
   a two-line reason, a React-controlled expander ("Why do we need this
   access?") that explains `drive.file` scope, memory-only tokens, and —
   explicitly — that the app cannot work at all without connecting. Two
   buttons: "Connect with Google Drive", which calls
   `ComicBuilder.storage.connect()` (GIS popup, human click), and
   "Connect with a code (for AI assistants)", which calls
   `ComicBuilder.storage.connectWithDevice()` — the OAuth device flow
   for headless browsers, showing a verification URL + user code for the
   user to approve on any other device.
2. **Tiles** (`tiles`) — one Bootstrap card per Drive project folder plus a
   dashed "New project" tile. The new-project name and page size (preset:
   US Comic, US Trade, Manga B5, A4, Square, Portrait 4:5, Landscape 16:9)
   are collected in a Bootstrap modal and stored in
   `metadata.pageSize`. Each tile opens through
   `ComicBuilder.storage.openProject(id)`. Connection is implicit — no
   connected-status indicator and no disconnect button anywhere in the UI
   (disconnect stays available as `ComicBuilder.storage.disconnect()`).
3. **Editor** (`editor`) — fills the viewport exactly (fixed layout; tab content
   scrolls inside it). A project with only its cover opens on the **Outline**
   tab; a project with more pages opens on **Pages**. The Bootstrap dark
   navbar has the project title left-aligned and, at the far right, a
   floppy-disk save button: it shows a spinner while a save is in flight,
   is disabled when nothing is unsaved, turns red after a failed save, and
   otherwise calls `ComicBuilder.storage.save()`. Its size is fixed, so
   saving never moves the title. On mobile the navbar also has two Bootstrap
   dropdowns that open directly under their toggles: a hamburger at the left
   (Open project, Preview this page, Close project) and a picker at the
   right showing the current tab. On desktop the tabs are a tab bar. Below
   the navbar the editor has four tabs — **Outline** (page-size preset and
   story outline), **Characters** (each with reference-image thumbnails and
   an upload button), **Scenes**, **Pages**. The Pages tab has a page-number
   rail on the left for desktop with a `+` button pinned to its bottom, and a
   horizontally scrolling page-number footer on mobile with the `+` button
   at its far right. Page numbers are plain (`0`, `1`, `2`); `+` calls
   `ComicBuilder.page.add()` and shows the new page.

   The selected page is the **only view**: a **page sheet** at the real
   aspect ratio of `metadata.pageSize` (the largest rectangle of that ratio
   that fits, via container-query units), with the **inspector** (a sidebar
   on desktop, capped to about 40% of the height below the page on mobile)
   for the highlighted panel. There are no modes. Every page always has at
   least one panel, so a new page is a blank sheet. Everything is edited on
   the sheet, and there is no help text.

   - **Panels.** Click a panel to highlight it (a blue outline; the only panel
     of a page is always highlighted). The highlighted panel is painted last
     and shows anything that spills out of it, so its handles stay reachable.
     Stacking is arranged so that content always sits above other panels: a
     panel's number badge is the first thing painted in it (under its own
     layers and bubbles), and only the highlighted panel uses `z-index`, so
     its layers, bubbles and handles paint over every other panel's canvas,
     number and bubbles.
     "Delete panel" removes it (the neighbours stretch over its space).
   - **Cutting.** Move the cursor beside the page (left or right) and a
     horizontal cut line follows it across the whole page; move it above or
     below the page and a vertical line does. Click to cut every panel the
     line crosses, through `panels.splitAcross`. The line snaps to 25, 33, 50,
     67 and 75% and to existing panel edges, and is red (and does nothing)
     when it would cut nothing. Dragging across a single panel cuts only that
     panel (`panels.split`), and the inspector's "Split evenly" (2/3/4 rows or
     columns) works on the highlighted panel. The lines between panels are
     draggable handles: dragging one previews the resize locally and commits on
     release through `panels.resize`, moving every panel on that line together
     so the page stays tiled.
   - **Layers.** A layer is a box on its panel (a background fills the panel
     instead). Selecting a layer, from its row or by clicking it on the page,
     shows four corner handles (resize about the centre, keeping the aspect
     ratio) and a rotate handle above it (snaps to 15°); dragging its body
     moves it. Drags preview locally and commit one `layers.update` on release.
     A layer without an image shows a dashed placeholder with its prompt.
     Delete or Backspace removes the selected layer or bubble unless a text
     field has focus.
   - **Bubbles.** A selected bubble shows corner handles (resize with the
     opposite corner fixed; the text is scaled to fit) and a blue dot at its
     pointer tip; dragging the body moves it and dragging the dot aims the
     pointer.
   - **Inspector** (for the highlighted panel), top to bottom: **Bubbles**
     ("+ Speech / Thought / Caption" and a row per bubble), **Layers** (a row
     per layer, top of the stack first, with a drag handle to reorder, a
     visibility checkbox, a chevron to expand its details, its name to select
     it, and a trash icon; "Expand all / Collapse all"; "Add layer", which adds
     an empty layer, selects and expands it and focuses its prompt so you can
     type what it should show), **Background** ("Set background", which becomes a
     "Background" row with the same chevron and trash icon), and "Split
     evenly". Expanded, a layer shows its name, prompt, an "Add image" /
     "Change image" button (upload a new image or pick one already in the
     project, with a spinner while it works) and opacity; a bubble shows its text and kind. Position, size and rotation are
     only on the page. Expanding a row and selecting it are independent.

4. **Preview overlay** (`preview` boolean) — the current page's panels with
   minimal chrome (page number/title + "Close preview"), rendered on a dark
   background (the same page sheet, without editing chrome) so an agent can
   screenshot a finished page. Preview is always
   per-page, never the whole project. Entered via
   `ComicBuilder.page.openPreview()`, exited via `closePreview()`.

**Status toasts.** Every status message ("Loading project…", "Opened …",
"Project closed.", errors) is a `StatusToast`: a Bootstrap toast fixed to the
top of the screen, above all other elements and outside the page flow. It
closes itself after 5 seconds and has a dismiss button; errors are red.

## 3. Data model

TypeScript source of truth: `src/types/comic.ts`. JSON Schema:
`public/schema/comic-project.schema.json` (draft 2020-12). Every Drive
project folder holds exactly one `project.json`.

- `ComicProject` — `{ id, title, pages[], updatedAt, savedAt, metadata }`.
  `savedAt` is stamped on every successful Drive write and drives the
  Saving/Saved indicator.
- `ComicPage` — `{ id, number, title, panels[] }`. `number` is 0-based and
  displayed as is (`0` = cover, `1` = page one).
- `Panel` — `{ id, title?, x, y, width, height, layers[], bubbles[] }`.
  `x`/`y`/`width`/`height` are percentages of the **page**. The panels of a
  page tile it (no gaps or overlaps), and each is at least 5% of the page
  wide and tall. A panel's aspect ratio follows from its rectangle and
  `metadata.pageSize`, so the canvas ratio is per panel. Every page has at
  least one panel. Older projects are normalized on load: a page without
  panels gets one full-page panel, and panels without rectangles are stacked
  as equal rows (`normalizeProject`).
- `Layer` — `{ id, name, kind: "background" | "foreground", src, mediaId?,
prompt?, aspectRatio?, visible, x, y, width, rotation, opacity }`. A layer
  is a `prompt` (what its art should show, for whoever generates the image)
  and optionally an image, so it can exist as just a prompt (`src` is `""`)
  and get its image later. `aspectRatio` (width / height) shapes a layer
  that has no image yet and tells the generator what proportions to use.
  Foreground layers should usually be PNGs with a transparent background;
  a background should be generated at its panel's aspect ratio.
  There is **no separate background field**: the background is the layer
  whose `kind` is `"background"`; it always fills the panel (cropped, never
  stretched) and sits at the bottom, so its `x`/`y`/`width` are ignored.
  Layers are drawn in **array order** (last on top); `layers.move` reorders.
  For foreground layers `x`/`y`/`width` are percentages of panel size and
  the aspect ratio is preserved. `src` is always the image's **Google Drive
  URL** (`https://www.googleapis.com/drive/v3/files/<id>?alt=media`): layers
  are created from a `mediaId` or a Drive URL and reject anything else, and
  `normalizeProject` turns older `driveFileId` layers and Drive share links
  into that form. `src` may also be empty (a prompt-only layer).
- `Bubble` — `{ id, kind: "speech" | "thought" | "caption", text, x, y,
width, height, tailX?, tailY? }`. Bubbles always render above all layers.
  `x`/`y` is the bubble's top-left corner and `width`/`height` its size, in
  percent of the panel; the text is scaled to fit that box (older bubbles
  without a `height` get 20 on load). Speech and thought bubbles have
  a pointer whose tip is `tailX`/`tailY` (percent of the panel): a wedge from
  the bubble's edge for speech, a trail of circles for thought; captions
  have none. `bubbles.add` aims a new pointer below the bubble.
- `ProjectMetadata` — `{ outline, pageSize, characters[], scenes[],
objects[], media[] }`: the story bible plus the media registry.
  `pageSize` is `{ label, widthIn, heightIn }`, chosen at creation from
  `PAGE_SIZE_PRESETS` (old projects without it load with the US Comic
  default).
- `Character` / `ComicObject` — `{ id, name, description, imageIds[],
sceneIds[] }`. The description carries visual continuity guidance.
- `Scene` — `{ id, name, description, characterIds[], imageIds[] }`.
- `MediaItem` — `{ id, name, driveFileId, url, mimeType }`. `url` values
  require a valid Drive access token to fetch bytes.

Structural validation lives in `src/state/project.ts` (`assertValidProject`,
`createBlankProject`).

## 4. The `window.ComicBuilder` API

Defined in `src/ai/actions.ts` as a nested object literal with JSDoc on
every node and method. `createComicBuilder(deps)` wires the object to the
host app through `ComicBuilderDeps` (getProject, updateProject,
replaceProject, page index, preview, status, storage, media). The API is
also the app's **LLM skill**: see §5.

Namespaces:

- `help()`
- `storage` — `connect()`, `connectWithDevice()`, `disconnect()`, `status()`, `listProjects()`,
  `createProject(name)`, `openProject(idOrName)`, `closeProject()` (saves
  first; stays open if saving fails), `showProjects()`, `save()`
- `project` — `load(data)` (replace the whole project from JSON, validated)
- `page` — `count()`, `select(i)`, `current()`, `add(input?)` (append a page
  with one full-page panel and show it), `openPreview()`, `closePreview()`
- `panels` — `list(pageIndex?)`, `get(panelId)`, `size(panelId)` (inches and
  aspect ratio and the pixel size to generate at, for sizing artwork),
  `splitAcross(axis, position, pageIndex?)` (a line across the whole page,
  cutting every panel it crosses), `split(panelId, axis, position?)`,
  `splitEvenly(panelId, axis, count)`, `resize(panelId, edge, position)`,
  `update(panelId, { title })`, `delete(panelId)`. `axis` is `"horizontal"`
  (a horizontal line: top and bottom parts) or `"vertical"`. Splitting keeps
  the original panel's id and content as the first (top/left) part and
  inserts the new empty panel right after it. `resize` moves one edge and
  every panel on the same dividing line (a horizontal line spans the page and
  moves as a whole; vertical lines belong to their row of panels), clamping
  at the minimum size; the page's outer edges are fixed. `delete` lets the
  neighbours that exactly cover one of its edges stretch over it, and
  refuses to delete a page's last panel. The pure geometry lives in
  `src/state/layout.ts`.
- `layers` — `list(panelId)`, `get(panelId, layerId)`, `add(panelId, layer)`
  (a background goes to the bottom; the image is optional, given as `mediaId`
  or a Drive URL), `update(panelId, layerId, patch)`, `delete(panelId,
layerId)`, `move(panelId, layerId, "top" | "bottom" | "up" | "down" |
index)`, `size(panelId, layerId)` (the size to generate the art at: the
  panel's for a background, `width` × `aspectRatio` for a foreground layer)
- `bubbles` — `list/get/add/update/delete`, addressed by panel id
- `metadata` — `get()`, `setOutline(text)`, `setPageSize(pageSize)`
- `characters` / `scenes` / `objects` — `list/get/create/update/delete`
- `media` — `list()`, `get(id)`, `upload(name, dataUrl, mimeType)` (data URL
  → File → Drive upload → registry entry)

Semantics:

- **Snapshots.** Reads return `structuredClone` deep copies — inspect them
  freely; mutating a snapshot changes nothing. All writes go through the
  action functions.
- **Ids.** Every created entity gets `crypto.randomUUID()` with a
  timestamp/random fallback.
- **One mutation path.** Every mutation goes through `deps.updateProject`,
  which marks the project as having unsaved changes for the autosave (§7).
  The navbar's save button calls `storage.save()`, like any agent would.
- **Two OAuth flows.** The GIS popup (`storage.connect()`) requires a real
  human click — browsers block popups from injected scripts, so an agent
  calling it alone cannot complete the flow. The device flow
  (`storage.connectWithDevice()`) works headless: it returns a
  verification URL + user code for the user to approve on any device, and
  the agent polls `storage.status()` until connected.

## 5. Runtime docs generation (the LLM skill)

`scripts/extract-docs.mjs` (run by both `npm run dev` and `npm run build`)
parses `src/ai/actions.ts` with the TypeScript compiler API, extracting the
JSDoc above the `ComicBuilder` literal and every namespace and method (object
properties, shorthand properties and methods are all handled; `@returns` text
that starts with `{ … }` is kept verbatim). It emits two artifacts:

1. `src/ai/actions.docs.gen.ts` — `ACTION_DOCS`, a path-keyed docs table, and
   `HELP_TEXT`, the rendered reference (gitignored; generated before `tsc`).
2. `public/llms.txt` — `HELP_TEXT` (conventions + every namespace/function
   with description, parameters and return value) plus the data model and
   key URLs. It is **deployed with the site**, next to `index.html`.

At runtime, `src/ai/docs.ts` (`attachDocs`) walks the API object and sets a
non-enumerable `toString()` on every node with its docs, and
`ComicBuilder.help()` returns `HELP_TEXT`. Both come from the same JSDoc, so
they cannot drift from the code.

## 6. Google Drive

- **Scope:** `drive.file` only. The app sees exactly the folders and files
  it created; `storage.listProjects()` is the complete project list.
- **Token storage:** the OAuth access token lives only in a JS module
  variable (page memory). It is never written to localStorage,
  sessionStorage, or cookies. Reloading the page drops the token — one
  click reconnects. `storage.disconnect()` saves any unsaved changes, then revokes the grant
  at Google (full sign-out).
- **Folder layout:** one folder per project (named after the project),
  containing `project.json` and uploaded artwork. Artwork is uploaded via
  `uploadImage()` and registered as `MediaItem`s; every image is a Drive file. Layers store its
  Drive URL. Because Drive needs the access token, `useDriveImage` fetches
  the bytes once (`loadBlobUrl`) and shows them from a blob URL. Character
  reference images are uploaded from the Characters tab via
  `media.upload` and shown as blob-URL thumbnails.
- **Client IDs:** `GOOGLE_CLIENT_ID` (Web application, GIS popup) and
  `GOOGLE_DEVICE_CLIENT_ID` + `GOOGLE_DEVICE_CLIENT_SECRET`
  ("TVs and Limited Input devices", device flow) at build time. They are
  read only from the dotenv files (`.env`, `.env.local`) by
  `vite.config.js`; shell env vars are ignored. CI writes `.env.local`
  from the repo secrets of the same names before building.
  The web client is a public OAuth client with no secret anywhere. The
  device client secret ships in the bundle by design: Google's
  device-client model assumes distributed apps cannot keep secrets (the
  same model rclone uses); it only identifies the client, scope stays
  `drive.file`, and access tokens remain memory-only.

## 7. Autosave

`useProjectSaver` (`src/state/useProjectSaver.ts`) owns saving. Every
mutation marks the project dirty (`markDirty`, called from `updateProject` and
`replaceProject`); nothing is written otherwise.

- **Cadence:** while a project is open, a 60-second interval saves it, but only
  if it is dirty. `storage.save()` (the navbar's floppy-disk button) saves
  immediately, and does nothing when clean.
- **Write:** `project.json` is written with `savedAt` and `updatedAt`
  stamped. Edits made while the write is in flight keep the project dirty for
  the next round; a failed write keeps it dirty too, shows an error toast and
  turns the button red.
- **Flush points:** closing a project and disconnecting save first; closing
  stays on the project if saving fails.
- **Unload:** while dirty, the browser asks for confirmation before the tab
  is closed, since up to a minute of changes could be lost.

## 8. Service worker & updates

Pattern: cache-first with commit-based update detection.

- `src/sw.ts` is bundled to `dist/sw.js` by `scripts/build-meta.mjs`
  (esbuild, minified IIFE) after `vite build`.
- `build-meta.mjs` also writes `dist/buildinfo.js` as
  `self.BUILD_INFO = { commit, builtAt, files }`, where `commit` is the
  current git HEAD and `files` is the recursive `dist/` listing (taken
  **after** bundling so `sw.js` is included; `buildinfo.js` itself is
  cached explicitly, not listed).
- The worker installs by fetching `buildinfo.js` and precaching every
  listed file into a cache named per registration scope (`comic-builder:<scope>`,
  so other sites on the same origin, such as other GitHub Pages projects of the
  same user, never clash); files a newer build no longer lists are pruned.
- On every navigation it fetches `buildinfo.js` with `cache: "no-store"`;
  if the commit differs, it re-downloads all files and posts
  `UPDATE_READY` to clients.
- `src/sw-register.ts` registers `./sw.js` **only in production builds**
  (never in dev), polls hourly and on visibility change, and shows a
  Bootstrap "new version available" banner with a Reload button when an
  update lands.

## 9. Build pipeline

`npm run build`:

```
node scripts/extract-docs.mjs   # actions.ts -> actions.docs.gen.ts + public/llms.txt
tsc -b                          # TypeScript (project references)
vite build                      # -> dist/
node scripts/build-meta.mjs     # bundle src/sw.ts -> dist/sw.js; write dist/buildinfo.js
```

`npm run dev` runs the extractor first for the same reason. Other scripts:
`npm run lint` (oxlint) and `npm test` (`scripts/run-tests.mjs` bundles every
`src/**/*.test.ts` with esbuild and runs it with Node's built-in test runner;
the tests cover the pure code: panel layout geometry, Drive URL parsing, and
project validation and normalization). Formatting: Prettier config in `.prettierrc.json` (single quotes, semicolons, 2-space,
100 col, es5 trailing commas); `npm run format` / `npm run format:check`;
a Husky pre-commit hook runs `lint-staged` on
`*.{js,ts,json,css,html,md}`. `src/ai/actions.docs.gen.ts`, `public/llms.txt` and `*.tsbuildinfo` are
gitignored (generated).

CI (`.github/workflows/ci.yml`): `npm ci`, `npm run format:check`,
`npm run lint`, `npm test`, `npm run build`. Deploy (`.github/workflows/deploy.yml`): on pushes to
`main` touching code/build paths, configure Pages, `npm ci`, `npm run
build` (after writing `.env.local` from the Google repo secrets), upload
`dist/`, deploy. The build uses `base: './'` (relative asset URLs), so the
site does not depend on the repository name or hosting path.

## 10. Styling rule

**Bootstrap owns all app chrome** — splash card, tiles, modal, navbar,
dropdown, banners, buttons, forms. Custom CSS (`src/App.css`) exists **only
for the comic canvas**: `.panels` grid, `.panel*` presentation,
`.panel-canvas` / `.panel-layer` positioning, `.bubble` variants, and a
small mobile adjustment. If it's UI chrome, it's a Bootstrap class; if
it's drawn comic content, it's custom CSS.

## 11. Agent testing constraints

- Drive OAuth during automated testing: the GIS popup (`storage.connect()`)
  needs the user's real click and cannot be completed headless. The device
  flow (`storage.connectWithDevice()`) is the headless path — the agent
  relays the URL + code to the user, who approves on any device; no
  throwaway credentials exist, so use the real user gesture.
- Static checks (tsc, vite build, prettier, extractor) are the automated
  gate. Live-browser verification — visual inspection and console
  injection of `window.ComicBuilder` — needs a real browser session and is
  done by the supervising agent, not the build subagent.
- After `npm run build` goes green and the deploy workflow is green,
  report OAuth-gated paths as unverified unless the user performed the
  gesture.

## 12. Source layout

- `src/App.tsx` — screen state, Drive wiring (`ComicBuilderDeps`), toast.
- `src/components/` — one file per screen or widget, grouped by role:
  screens (`SplashScreen`, `ProjectTiles`, `EditorScreen`, `PreviewScreen`),
  editor chrome (`EditorNavbar`, `SaveButton`, `StatusToast`, `DropdownMenu`),
  tabs (`PagesTab`, `OutlineTab`, `StoryTab`, `ReferenceImages`), the page
  canvas (`PageSheet`, `PanelView`, `LayerBox`, `BubbleView`, `CornerHandle`,
  `bubbleShape.ts`) and the inspector (`PanelInspector`, `BubblesSection`,
  `LayersSection`, `BackgroundSection`, `LayerRow`, `LayerDetails`,
  `MediaPicker`, `RowButtons`). Small hooks and helpers live beside them
  (`useTask`, `useExpansion`, `useDriveImage`, `panelActions`, `selection`).
- `src/ai/` — `actions.ts` (the documented `window.ComicBuilder` literal:
  the JSDoc there is the source of the LLM docs), `builders.ts` (the shared
  list/get/add/update/delete builders and validation it is assembled from),
  `deps.ts` (`ComicBuilderDeps` and the input/patch types), `docs.ts`,
  generated `actions.docs.gen.ts`.
- `src/drive/` — `driveClient.ts` (OAuth + Drive REST), `projectStore.ts`
  (load, validate and normalize a project).
- `src/state/` — project validation/creation/normalization (`project.ts`),
  panel layout geometry (`layout.ts`) and `useProjectSaver`.
- `src/types/comic.ts` — the data model; `src/utils/` — small shared helpers
  (`driveUrl.ts` builds and parses Drive URLs, `geometry.ts`, `drag.ts`, ...).
- `*.test.ts` files sit next to the code they test (`npm test`).
