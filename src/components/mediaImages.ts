import { downloadFile } from '../drive/driveClient';

const blobUrls = new Map<string, Promise<string>>();

/** Drive URLs need an auth header, so images are fetched once and shown from blob URLs. */
export function loadBlobUrl(driveFileId: string): Promise<string> {
  let url = blobUrls.get(driveFileId);
  if (!url) {
    url = downloadFile(driveFileId).then((blob) => URL.createObjectURL(blob));
    url.catch(() => blobUrls.delete(driveFileId));
    blobUrls.set(driveFileId, url);
  }
  return url;
}
