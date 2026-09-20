import { useEffect, useState } from 'react';
import { driveFileIdFromUrl } from '../utils/driveUrl';
import { loadBlobUrl } from './mediaImages';

/**
 * A Drive image URL as something an <img> can show: Drive needs the user's
 * access token, so the bytes are fetched once and served from a blob URL.
 * Null until loaded (or when the URL is not a Drive URL).
 */
export function useDriveImage(src: string): string | null {
  const [loaded, setLoaded] = useState<{ src: string; url: string } | null>(null);

  useEffect(() => {
    const fileId = driveFileIdFromUrl(src);
    if (!fileId) return;
    let current = true;
    loadBlobUrl(fileId).then(
      (url) => current && setLoaded({ src, url }),
      () => undefined
    );
    return () => {
      current = false;
    };
  }, [src]);

  return loaded?.src === src ? loaded.url : null;
}
