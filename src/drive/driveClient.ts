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
import { DRIVE_FILE_SCOPE, pollDeviceOnce, startDeviceFlow } from './deviceOAuth';
import type { DeviceCodeInfo } from './deviceOAuth';
import { createDriveRest } from './driveRest';

// The REST calls and the device-flow requests live in driveRest.ts and deviceOAuth.ts (no browser
// APIs, shared with the CLI); these re-exports keep this module the one place the app imports from.
export { ProjectFileMissingError } from './driveRest';
export type { ProjectFolder } from './driveRest';
export type { DeviceCodeInfo } from './deviceOAuth';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

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

const DEVICE_EXPIRED_MESSAGE = 'The device code expired before approval. Start over.';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function pollDeviceToken(
  client: { clientId: string; clientSecret: string },
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
  signal: AbortSignal
): Promise<void> {
  const deadline = Date.now() + expiresInSeconds * 1000;
  for (;;) {
    if (signal.aborted) throw new Error('Device authorization was cancelled.');
    if (Date.now() >= deadline) throw new Error(DEVICE_EXPIRED_MESSAGE);
    await sleep(intervalSeconds * 1000);

    const result = await pollDeviceOnce(client, deviceCode);
    if (result.status === 'granted') {
      storeToken(result.accessToken, result.expiresIn);
      return;
    }
    if (result.status === 'failed') throw new Error(result.message);
    if (result.slowDown) intervalSeconds += 5;
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

  const grant = await startDeviceFlow(clientId);
  const controller = new AbortController();
  const promise = pollDeviceToken(
    { clientId, clientSecret },
    grant.deviceCode,
    grant.intervalSeconds,
    grant.info.expiresInSeconds,
    controller.signal
  );
  promise.catch(() => undefined); // awaiters still see the rejection
  activeDevicePoll = { promise, cancel: () => controller.abort() };
  return grant.info;
}

/** Resolves once the pending device authorization completes; rejects on denial, expiry or cancel. */
export function awaitDeviceAccess(): Promise<void> {
  if (!activeDevicePoll) throw new Error('No device authorization in progress.');
  return activeDevicePoll.promise;
}

// ---------------------------------------------------------------------------
// Drive API
// ---------------------------------------------------------------------------

const drive = createDriveRest({ getToken: getAccessToken });

export const listProjectFolders = drive.listProjectFolders;
export const ensureProjectFolder = drive.ensureProjectFolder;
export const uploadImage = drive.uploadImage;
export const trashFile = drive.trashFile;
export const downloadFile = drive.downloadFile;
export const saveProjectJson = drive.saveProjectJson;
export const loadProjectJson = drive.loadProjectJson;
