/**
 * Google Drive integration: OAuth 2.0 entirely client-side, no backend.
 *
 * Scope is `drive.file`, so the app only sees files and folders it created.
 * The access token lives only in this module's memory (never web storage,
 * cookies or the URL), so reloading the page drops it and one click
 * reconnects.
 *
 * Two ways to obtain a token:
 * - Google Identity Services popup (`requestDriveAccess`), which needs a real
 *   user gesture.
 * - The OAuth device flow (RFC 8628, `requestDeviceAccess`) for headless
 *   browsers and AI assistants. It needs the device client's secret, which
 *   ships in the bundle by design: Google's device-client model assumes
 *   distributed apps cannot keep secrets, and the secret only identifies the
 *   client.
 */

import { getGoogleClientId, getGoogleDeviceClientId, getGoogleDeviceClientSecret } from '../config';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const PROJECT_FILE_NAME = 'project.json';
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/** Thrown when a Drive folder has no project.json yet. */
export class ProjectFileMissingError extends Error {}

export interface ProjectFolder {
  id: string;
  name: string;
}

interface DriveFileMeta extends ProjectFolder {
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Access token
// ---------------------------------------------------------------------------

let token: { value: string; expiresAt: number } | null = null;

function storeToken(value: string, expiresInSeconds: number | string | undefined): void {
  token = { value, expiresAt: Date.now() + (Number(expiresInSeconds) || 3600) * 1000 };
}

/** The access token, or null when missing or about to expire. */
export function getAccessToken(): string | null {
  return token && token.expiresAt > Date.now() + TOKEN_EXPIRY_MARGIN_MS ? token.value : null;
}

export function hasDriveAccess(): boolean {
  return getAccessToken() !== null;
}

// ---------------------------------------------------------------------------
// Google Identity Services popup flow
// ---------------------------------------------------------------------------

interface GisTokenResponse {
  access_token: string;
  expires_in: number | string;
  error?: string;
  error_description?: string;
}

interface GisOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GisTokenResponse) => void;
    error_callback: (error: unknown) => void;
  }): { requestAccessToken(options: { prompt: string }): void };
  revoke(accessToken: string, done: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GisOAuth2 } };
  }
}

let gisLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  gisLoadPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** Prompt for Drive access. Must be called from a user gesture (a button click). */
export async function requestDriveAccess(): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      'Google OAuth client ID is not configured. Set GOOGLE_CLIENT_ID in .env.local.'
    );
  }
  await loadGisScript();
  return new Promise((resolve, reject) => {
    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          storeToken(response.access_token, response.expires_in);
          resolve();
        },
        error_callback: (error) => reject(toError(error)),
      });
      // The default prompt shows Google's consent screen only the first time (and again after a
      // revoke); later connects are a popup that closes itself, or an account chooser. 'consent'
      // would force the full screen on every reload for no gain: this flow has no refresh token.
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      reject(toError(e));
    }
  });
}

/** Revoke the grant at Google and drop the token. */
export async function disconnectDrive(): Promise<void> {
  cancelDeviceAccess();
  const revoked = token;
  token = null;
  if (revoked) window.google?.accounts?.oauth2.revoke(revoked.value, () => undefined);
}

// ---------------------------------------------------------------------------
// OAuth device flow (RFC 8628)
// ---------------------------------------------------------------------------

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const DEVICE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

const DEVICE_FLOW_ERRORS: Record<string, string> = {
  access_denied: 'The user denied the device authorization request.',
  expired_token: 'The device code expired before approval. Start over.',
};

/** What the user needs to approve the request on any other device. */
export interface DeviceCodeInfo {
  /** e.g. https://www.google.com/device */
  url: string;
  /** e.g. "ABCD-EFGH" */
  code: string;
  expiresInSeconds: number;
}

interface OAuthError {
  error?: string;
  error_description?: string;
}

interface DeviceCodeResponse extends OAuthError {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval?: number;
}

interface DeviceTokenResponse extends OAuthError {
  access_token?: string;
  expires_in?: number;
}

/** POST a form and parse the JSON body; Google reports OAuth errors in the body of non-2xx replies. */
async function postForm<T>(url: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return (await res.json()) as T;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function pollDeviceToken(
  credentials: { clientId: string; clientSecret: string },
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
  signal: AbortSignal
): Promise<void> {
  const deadline = Date.now() + expiresInSeconds * 1000;
  for (;;) {
    if (signal.aborted) throw new Error('Device authorization was cancelled.');
    if (Date.now() >= deadline) throw new Error(DEVICE_FLOW_ERRORS.expired_token);
    await sleep(intervalSeconds * 1000);

    let data: DeviceTokenResponse;
    try {
      data = await postForm<DeviceTokenResponse>(DEVICE_TOKEN_URL, {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        device_code: deviceCode,
        grant_type: DEVICE_GRANT_TYPE,
      });
    } catch {
      continue; // transient network error: keep polling until the deadline
    }

    if (data.access_token) {
      storeToken(data.access_token, data.expires_in);
      return;
    }
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      intervalSeconds += 5;
      continue;
    }
    throw new Error(
      DEVICE_FLOW_ERRORS[data.error ?? ''] ??
        `Device authorization failed: ${data.error_description || data.error || 'unknown error'}.`
    );
  }
}

let activeDevicePoll: { promise: Promise<void>; cancel: () => void } | null = null;

function cancelDeviceAccess(): void {
  activeDevicePoll?.cancel();
  activeDevicePoll = null;
}

/**
 * Start the device flow: resolves promptly with the URL and code to show the
 * user while the token is polled for in the background (see
 * `awaitDeviceAccess`). Starting a new flow cancels any previous one.
 */
export async function requestDeviceAccess(): Promise<DeviceCodeInfo> {
  const clientId = getGoogleDeviceClientId();
  const clientSecret = getGoogleDeviceClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Device connect is not configured (missing Google device OAuth client).');
  }
  cancelDeviceAccess();

  const data = await postForm<DeviceCodeResponse>(DEVICE_CODE_URL, {
    client_id: clientId,
    scope: DRIVE_FILE_SCOPE,
  });
  if (data.error || !data.device_code) {
    throw new Error(
      `Could not start device authorization: ${data.error_description || data.error || 'unknown error'}.`
    );
  }

  const expiresInSeconds = Number(data.expires_in) || 1800;
  const controller = new AbortController();
  const promise = pollDeviceToken(
    { clientId, clientSecret },
    data.device_code,
    Number(data.interval) || 5,
    expiresInSeconds,
    controller.signal
  );
  promise.catch(() => undefined); // awaiters still see the rejection
  activeDevicePoll = { promise, cancel: () => controller.abort() };
  return { url: data.verification_url, code: data.user_code, expiresInSeconds };
}

/** Resolves once the pending device authorization completes; rejects on denial, expiry or cancel. */
export function awaitDeviceAccess(): Promise<void> {
  if (!activeDevicePoll) throw new Error('No device authorization in progress.');
  return activeDevicePoll.promise;
}

// ---------------------------------------------------------------------------
// Drive API
// ---------------------------------------------------------------------------

async function driveRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = getAccessToken();
  if (!accessToken) throw new Error('Not connected to Google Drive.');
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function queryFiles<T>(query: string, fields: string, params = ''): Promise<T[]> {
  const res = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(${fields})${params}`
  );
  return ((await res.json()).files ?? []) as T[];
}

async function createFile(
  metadata: object,
  content: Blob | string,
  contentType: string
): Promise<DriveFileMeta> {
  const boundary = `cb-${Date.now()}`;
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );
  const res = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType`,
    { method: 'POST', body }
  );
  return (await res.json()) as DriveFileMeta;
}

/** Folders this app created (the `drive.file` scope hides everything else). */
export function listProjectFolders(): Promise<ProjectFolder[]> {
  return queryFiles<ProjectFolder>(
    `mimeType='${FOLDER_MIME_TYPE}' and trashed=false`,
    'id,name',
    '&orderBy=name&pageSize=100'
  );
}

/** Find (or create) the folder that holds a comic's files. */
export async function ensureProjectFolder(name: string): Promise<DriveFileMeta> {
  const escaped = name.replace(/'/g, "\\'");
  const [existing] = await queryFiles<DriveFileMeta>(
    `mimeType='${FOLDER_MIME_TYPE}' and name='${escaped}' and trashed=false`,
    'id,name,mimeType',
    '&pageSize=1'
  );
  if (existing) return existing;

  const res = await driveRequest(`${DRIVE_API}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE }),
  });
  return (await res.json()) as DriveFileMeta;
}

export function uploadImage(folderId: string, file: File, name?: string): Promise<DriveFileMeta> {
  return createFile(
    { name: name || file.name, parents: [folderId] },
    file,
    file.type || 'image/png'
  );
}

/** Move a file to the Drive trash (recoverable there). A file that is already gone counts as trashed. */
export async function trashFile(fileId: string): Promise<void> {
  try {
    await driveRequest(`${DRIVE_API}/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith('Drive API error 404'))) throw e;
  }
}

export async function downloadFile(fileId: string): Promise<Blob> {
  const res = await driveRequest(`${DRIVE_API}/files/${fileId}?alt=media`);
  return await res.blob();
}

async function findProjectFile(folderId: string): Promise<{ id: string } | undefined> {
  const [file] = await queryFiles<{ id: string }>(
    `'${folderId}' in parents and name='${PROJECT_FILE_NAME}' and trashed=false`,
    'id',
    '&pageSize=1'
  );
  return file;
}

/** Create or overwrite project.json in the project folder. */
export async function saveProjectJson(folderId: string, project: unknown): Promise<void> {
  const json = JSON.stringify(project, null, 2);
  const existing = await findProjectFile(folderId);
  if (existing) {
    await driveRequest(`${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
  } else {
    await createFile({ name: PROJECT_FILE_NAME, parents: [folderId] }, json, 'application/json');
  }
}

export async function loadProjectJson(folderId: string): Promise<unknown> {
  const file = await findProjectFile(folderId);
  if (!file) throw new ProjectFileMissingError('No project.json found in this Drive folder.');
  const res = await driveRequest(`${DRIVE_API}/files/${file.id}?alt=media`);
  return await res.json();
}
