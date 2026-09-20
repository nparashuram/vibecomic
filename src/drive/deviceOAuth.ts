/**
 * The OAuth device flow (RFC 8628) against Google, as plain `fetch` calls with
 * no browser APIs, shared by the page (driveClient.ts polls in a loop, in
 * memory) and the CLI (which keeps the refresh token on disk). Scope is
 * `drive.file`. The device client's secret ships in the bundle by design:
 * Google's device-client model assumes distributed apps cannot keep secrets.
 */

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

const DEVICE_FLOW_ERRORS: Record<string, string> = {
  access_denied: 'The user denied the device authorization request.',
  expired_token: 'The device code expired before approval. Start over.',
};

export interface DeviceClient {
  clientId: string;
  clientSecret: string;
}

/** What the user needs to approve the request on any other device. */
export interface DeviceCodeInfo {
  /** e.g. https://www.google.com/device */
  url: string;
  /** e.g. "ABCD-EFGH" */
  code: string;
  expiresInSeconds: number;
}

/** A started device flow: what to show the user, and what to poll with. */
export interface DeviceGrant {
  info: DeviceCodeInfo;
  deviceCode: string;
  intervalSeconds: number;
}

/** The result of asking Google once whether the user has approved. */
export type DevicePoll =
  | { status: 'pending'; slowDown: boolean }
  | { status: 'granted'; accessToken: string; expiresIn: number; refreshToken?: string }
  | { status: 'failed'; message: string };

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

interface TokenResponse extends OAuthError {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

/** POST a form and parse the JSON body; Google reports OAuth errors in the body of non-2xx replies. */
async function postForm<T>(
  fetchImpl: typeof fetch,
  url: string,
  params: Record<string, string>
): Promise<T> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return (await res.json()) as T;
}

/** Start the flow: Google returns the code the user types in and the device code to poll with. */
export async function startDeviceFlow(
  clientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DeviceGrant> {
  const data = await postForm<DeviceCodeResponse>(fetchImpl, DEVICE_CODE_URL, {
    client_id: clientId,
    scope: DRIVE_FILE_SCOPE,
  });
  if (data.error || !data.device_code) {
    throw new Error(
      `Could not start device authorization: ${data.error_description || data.error || 'unknown error'}.`
    );
  }
  return {
    deviceCode: data.device_code,
    intervalSeconds: Number(data.interval) || 5,
    info: {
      url: data.verification_url,
      code: data.user_code,
      expiresInSeconds: Number(data.expires_in) || 1800,
    },
  };
}

/** Ask Google once whether the user has approved. A network error counts as still pending. */
export async function pollDeviceOnce(
  client: DeviceClient,
  deviceCode: string,
  fetchImpl: typeof fetch = fetch
): Promise<DevicePoll> {
  let data: TokenResponse;
  try {
    data = await postForm<TokenResponse>(fetchImpl, TOKEN_URL, {
      client_id: client.clientId,
      client_secret: client.clientSecret,
      device_code: deviceCode,
      grant_type: DEVICE_GRANT_TYPE,
    });
  } catch {
    return { status: 'pending', slowDown: false };
  }
  if (data.access_token) {
    return {
      status: 'granted',
      accessToken: data.access_token,
      expiresIn: Number(data.expires_in) || 3600,
      refreshToken: data.refresh_token,
    };
  }
  if (data.error === 'authorization_pending') return { status: 'pending', slowDown: false };
  if (data.error === 'slow_down') return { status: 'pending', slowDown: true };
  return {
    status: 'failed',
    message:
      DEVICE_FLOW_ERRORS[data.error ?? ''] ??
      `Device authorization failed: ${data.error_description || data.error || 'unknown error'}.`,
  };
}

/** Exchange a refresh token for a new access token. Throws when Google refuses (e.g. access revoked). */
export async function refreshAccessToken(
  client: DeviceClient,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ accessToken: string; expiresIn: number }> {
  const data = await postForm<TokenResponse>(fetchImpl, TOKEN_URL, {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (!data.access_token) {
    throw new Error(
      `Could not refresh the Google login: ${data.error_description || data.error || 'unknown error'}.`
    );
  }
  return { accessToken: data.access_token, expiresIn: Number(data.expires_in) || 3600 };
}

/** Revoke a token (access or refresh) at Google. Failures are ignored: the local copy is dropped regardless. */
export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await postForm(fetchImpl, REVOKE_URL, { token });
  } catch {
    /* offline: nothing more to do */
  }
}
