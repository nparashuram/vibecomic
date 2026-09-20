import type { MediaItem } from '../types/comic';
import type { MediaInfo } from './mediaImages';

/** What the picker is choosing an image for: decides which images are listed first. */
export type MediaPreference =
  /** A panel background: opaque images, best those with the panel's aspect ratio (width / height). */
  | { kind: 'background'; aspectRatio?: number }
  /** A layer: transparent images (cut-outs) first. */
  | { kind: 'layer' };

export interface MediaGroup {
  title: string;
  items: MediaItem[];
}

/** How far an image's ratio may differ from the panel's (relative) and still count as fitting. */
const RATIO_TOLERANCE = 0.05;

function fits(info: MediaInfo, aspectRatio?: number): boolean {
  return !!aspectRatio && Math.abs(info.aspect - aspectRatio) / aspectRatio <= RATIO_TOLERANCE;
}

/** Splits the project's media into titled groups, best suggestions first; empty groups are left out. */
export function groupMedia(
  media: MediaItem[],
  infos: Map<string, MediaInfo | undefined>,
  prefer: MediaPreference
): MediaGroup[] {
  const groups: MediaGroup[] =
    prefer.kind === 'background'
      ? [
          { title: 'Fits this panel', items: [] },
          { title: 'Other backgrounds', items: [] },
          { title: 'Other images', items: [] },
        ]
      : [
          { title: 'Transparent images', items: [] },
          { title: 'Other images', items: [] },
        ];

  for (const item of media) {
    const info = infos.get(item.driveFileId);
    let rank: number;
    if (prefer.kind === 'background') {
      rank = !info || info.transparent ? 2 : fits(info, prefer.aspectRatio) ? 0 : 1;
    } else {
      rank = info?.transparent ? 0 : 1;
    }
    groups[rank].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

/** Images shown per page of the picker. */
export const MEDIA_PAGE_SIZE = 24;

/**
 * One page of the grouped images, in order. A group that runs across pages is cut and its title
 * repeats on the next. `page` (zero-based) is clamped to the pages that exist.
 */
export function pageOfGroups(
  groups: MediaGroup[],
  page: number,
  pageSize = MEDIA_PAGE_SIZE
): { groups: MediaGroup[]; page: number; pages: number } {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(0, page), pages - 1);
  const first = current * pageSize;

  const shown: MediaGroup[] = [];
  let seen = 0;
  for (const group of groups) {
    const from = Math.max(0, first - seen);
    const to = Math.min(group.items.length, first + pageSize - seen);
    if (from < to) shown.push({ title: group.title, items: group.items.slice(from, to) });
    seen += group.items.length;
  }
  return { groups: shown, page: current, pages };
}

/** The zero-based page that holds the item, or 0 when it is not listed. */
export function pageOfItem(
  groups: MediaGroup[],
  id: string | undefined,
  pageSize = MEDIA_PAGE_SIZE
): number {
  const index = groups.flatMap((group) => group.items).findIndex((item) => item.id === id);
  return index < 0 ? 0 : Math.floor(index / pageSize);
}
