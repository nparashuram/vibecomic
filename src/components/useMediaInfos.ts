import { useEffect, useState } from 'react';
import type { MediaItem } from '../types/comic';
import { cachedMediaInfo, loadMediaInfo, type MediaInfo } from './mediaImages';

/**
 * The shape and transparency of every image, keyed by Drive file id (undefined for an image that
 * could not be read), and whether all of them are known yet. The reading happens in the
 * background, so the picker can show its images at once and sort them when this is ready.
 */
export function useMediaInfos(media: MediaItem[]): {
  infos: Map<string, MediaInfo | undefined>;
  ready: boolean;
} {
  const [settledFor, setSettledFor] = useState<MediaItem[] | null>(null);
  const allCached = media.every((item) => cachedMediaInfo(item.driveFileId));

  useEffect(() => {
    if (allCached) return;
    let current = true;
    void Promise.allSettled(media.map(loadMediaInfo)).then(() => current && setSettledFor(media));
    return () => {
      current = false;
    };
  }, [media, allCached]);

  return {
    infos: new Map(media.map((item) => [item.driveFileId, cachedMediaInfo(item.driveFileId)])),
    ready: allCached || settledFor === media,
  };
}
