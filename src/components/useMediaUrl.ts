import { useEffect, useState } from 'react';
import type { MediaItem } from '../types/comic';
import { errorMessage } from '../utils/errors';
import { loadDisplayUrl } from './mediaImages';

type Source = Pick<MediaItem, 'driveFileId' | 'thumbnailDriveFileId'>;

/**
 * An image as something an <img> can show: its thumbnail when it has one that loads, else the full
 * file. `failed` when neither could be loaded, with the reason in `error`.
 */
export function useMediaUrl(source: Source | null): {
  url: string | null;
  failed: boolean;
  error: string | null;
} {
  const full = source?.driveFileId ?? null;
  const thumb = source?.thumbnailDriveFileId;
  const key = full && `${thumb ?? ''}/${full}`;
  const [state, setState] = useState<{ key: string | null; url: string | null; error?: string }>({
    key: null,
    url: null,
  });

  useEffect(() => {
    if (!full) return;
    let current = true;
    loadDisplayUrl({ driveFileId: full, thumbnailDriveFileId: thumb }).then(
      (url) => current && setState({ key, url }),
      (e) => current && setState({ key, url: null, error: errorMessage(e) })
    );
    return () => {
      current = false;
    };
  }, [key, full, thumb]);

  const settled = key !== null && state.key === key;
  return {
    url: settled ? state.url : null,
    failed: settled && !state.url,
    error: settled ? (state.error ?? null) : null,
  };
}
