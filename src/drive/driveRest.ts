/**
 * The Google Drive REST calls the app makes, with no browser APIs: the access
 * token and `fetch` are injected, so the same code runs in the page (with the
 * token from driveClient.ts) and in Node (the CLI). Scope is `drive.file`, so
 * only files and folders this app created are visible.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const PROJECT_FILE_NAME = 'project.json';

/** Thrown when a Drive folder has no project.json yet. */
export class ProjectFileMissingError extends Error {}

export interface ProjectFolder {
  id: string;
  name: string;
}

export interface DriveFileMeta extends ProjectFolder {
  mimeType: string;
}

export interface DriveRestOptions {
  /** The current access token, or null when there is none (or it is about to expire). */
  getToken: () => string | null;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export function createDriveRest({ getToken, fetch: fetchImpl = fetch }: DriveRestOptions) {
  async function driveRequest(url: string, init: RequestInit = {}): Promise<Response> {
    const accessToken = getToken();
    if (!accessToken) throw new Error('Not connected to Google Drive.');
    const res = await fetchImpl(url, {
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

  async function findProjectFile(folderId: string): Promise<{ id: string } | undefined> {
    const [file] = await queryFiles<{ id: string }>(
      `'${folderId}' in parents and name='${PROJECT_FILE_NAME}' and trashed=false`,
      'id',
      '&pageSize=1'
    );
    return file;
  }

  return {
    /** Folders this app created (the `drive.file` scope hides everything else). */
    listProjectFolders(): Promise<ProjectFolder[]> {
      return queryFiles<ProjectFolder>(
        `mimeType='${FOLDER_MIME_TYPE}' and trashed=false`,
        'id,name',
        '&orderBy=name&pageSize=100'
      );
    },

    /** Find (or create) the folder that holds a comic's files. */
    async ensureProjectFolder(name: string): Promise<DriveFileMeta> {
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
    },

    uploadImage(folderId: string, file: File, name?: string): Promise<DriveFileMeta> {
      return createFile(
        { name: name || file.name, parents: [folderId] },
        file,
        file.type || 'image/png'
      );
    },

    /** Move a file to the Drive trash (recoverable there). A file that is already gone counts as trashed. */
    async trashFile(fileId: string): Promise<void> {
      try {
        await driveRequest(`${DRIVE_API}/files/${fileId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        });
      } catch (e) {
        if (!(e instanceof Error && e.message.startsWith('Drive API error 404'))) throw e;
      }
    },

    async downloadFile(fileId: string): Promise<Blob> {
      const res = await driveRequest(`${DRIVE_API}/files/${fileId}?alt=media`);
      return await res.blob();
    },

    /** Create or overwrite project.json in the project folder. */
    async saveProjectJson(folderId: string, project: unknown): Promise<void> {
      const json = JSON.stringify(project, null, 2);
      const existing = await findProjectFile(folderId);
      if (existing) {
        await driveRequest(`${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        });
      } else {
        await createFile(
          { name: PROJECT_FILE_NAME, parents: [folderId] },
          json,
          'application/json'
        );
      }
    },

    async loadProjectJson(folderId: string): Promise<unknown> {
      const file = await findProjectFile(folderId);
      if (!file) throw new ProjectFileMissingError('No project.json found in this Drive folder.');
      const res = await driveRequest(`${DRIVE_API}/files/${file.id}?alt=media`);
      return await res.json();
    },
  };
}

export type DriveRest = ReturnType<typeof createDriveRest>;
