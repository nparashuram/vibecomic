# VibeComics

Build and edit a comic (or graphic novel) in your browser. Your comic is
stored as a `project.json` plus artwork files in a folder on **your Google
Drive** — the app is a static site with no server of its own.

## Run it locally

```bash
npm install
npm run dev
```

Other scripts: `npm run build` (production build into `dist/`), `npm test`,
`npm run lint`, `npm run format`.

Open the printed URL. Connect your Google Drive once per session, then open
an existing project folder or create a new one. Changes are saved to Drive
automatically every minute (only when something changed), or immediately with the
floppy-disk button in the navbar.

The app's [privacy policy](public/pages/privacy.html) and
[terms of service](public/pages/tos.html) are plain, self-contained HTML pages,
served at `/pages/privacy.html` and `/pages/tos.html`. The logo is
`public/favicon.svg` (the tab icon) and `public/logo.png` (1024 px).

## Google Drive setup

The app talks to Drive through OAuth 2.0 entirely client-side. You need two
Google OAuth clients: a web client for browser users, and a device flow client
for headless browsers and AI assistants.

### Step 1: Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Drive API**: [APIs & Services > Library > search "Drive API" > Enable](https://console.cloud.google.com/apis/api/drive.googleapis.com/) - ensure that the right project is selected

### Step 2: Create the Web application OAuth client

1. Go to APIs & Services > Credentials
2. Click ["Create Credentials" > "OAuth client ID"](https://console.cloud.google.com/auth/clients/create)
3. Select **Web application** as the application type
4. Under "Authorized JavaScript origins", add:
   - `http://localhost:8080` for local development
   - `https://<your-username>.github.io` for your deployed site
   - (Add any other origins where you'll run the app)
5. **No redirect URIs or client secret needed** for the web client
6. Click "Create" and copy the **Client ID**

### Step 3: Create the "TVs and Limited Input devices" OAuth client

1. Again, click "Create Credentials" > "OAuth client ID"
2. Select **TVs and Limited Input devices** as the application type
3. Click "Create" and copy both the **Client ID** and **Client secret**

### Step 4: Configure the dotenv file

Rename `.env.example` to `.env.local` (git ignored) and add your values. The
build reads only `.env` / `.env.local`; variables exported in your shell are
ignored, and there is no `VITE_` prefix.

```
GOOGLE_CLIENT_ID=your-web-client-id-here
GOOGLE_DEVICE_CLIENT_ID=your-device-client-id-here
GOOGLE_DEVICE_CLIENT_SECRET=your-device-client-secret-here
```

Then run `npm run dev`.

### For deployment

Store these values as GitHub repository secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_DEVICE_CLIENT_ID`
- `GOOGLE_DEVICE_CLIENT_SECRET`

The deploy workflow writes these secrets into `.env.local` before building.

### Why two clients?

- **Web client**: Used by regular browser users who click "Connect with Google"
- **Device client**: Used by headless browsers and AI assistants via the
  "Connect with a code" flow (like OAuth for TVs)

The device client secret ships in the app bundle by design—Google's device
flow model assumes distributed apps cannot keep secrets (same model used by
tools like rclone).

## Deploy

Pushing to `main` runs the `Deploy to GitHub Pages` workflow, which builds
`dist/` (including the service worker and build metadata) and publishes it.
The site uses relative URLs, so it works from any path (a project site such as
`https://<user>.github.io/<repo>/`, a custom domain, or a sub-folder).

One-time setup for a new repository:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Add the three repository secrets listed above.
3. In the Google Cloud web OAuth client, add the site's origin (for example
   `https://<user>.github.io`, without any path) to the authorized JavaScript
   origins.

## For AI agents

Agents use the command line, `vibecomics.mjs`, which is deployed next to the
site (<https://nparashuram.github.io/vibecomics/vibecomics.mjs>; Node.js 20 or
newer; nothing to install, no browser needed):

```sh
node vibecomics.mjs help                    # every command
node vibecomics.mjs auth login              # prints a URL + code for the user to approve
node vibecomics.mjs auth status             # finishes the login once they have
node vibecomics.mjs storage createProject "My comic"
node vibecomics.mjs layers add <panelId> '{"prompt":"…"}'
```

It is the same API as `window.ComicBuilder` in the app (see below), one command
per function, printing JSON. The login (a refresh token) and the open project
are kept in `~/.vibecomics` (`VIBECOMICS_HOME` moves it); each command loads the
project from Drive, changes it and saves it back. Locally, `npm run cli -- help`
builds and runs it (it needs the device OAuth client in `.env.local`, like the
app's "connect with a code" option).

In the running app's browser console, the same API is:

```js
ComicBuilder.help();
```

That prints the API reference: every action is documented via JSDoc-derived
`.toString()` docs on the runtime API. A static copy is generated to
`public/api.txt` and deployed with the site, next to `public/llms.txt`, the
step-by-step guide an agent follows to build a comic (workflow, visual style,
image formats, continuity), which is written by hand in `scripts/llms-guide.md`. The engineering design — architecture, data model,
Drive scope, autosave, service worker, build pipeline — is in `spec.md`.
