const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';

const FILE_ID_PATTERNS = [
  /^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([\w-]+)/,
  /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/,
  /^https:\/\/drive\.google\.com\/(?:uc|open)\?(?:[^#]*&)?id=([\w-]+)/,
  /^https:\/\/drive\.usercontent\.google\.com\/download\?(?:[^#]*&)?id=([\w-]+)/,
];

/** The canonical URL of a Drive file's bytes. Fetching it needs the user's Drive access token. */
export const driveFileUrl = (fileId: string): string => `${DRIVE_FILES_API}/${fileId}?alt=media`;

/** The file id in a Google Drive file URL (API, share link or download link), or null for any other URL. */
export function driveFileIdFromUrl(url: string): string | null {
  for (const pattern of FILE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
