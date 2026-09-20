import { useSyncExternalStore } from 'react';

const onResize = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};

/** Whether a CSS media query currently matches, kept up to date. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** The viewport height in pixels, kept up to date. */
export function useViewportHeight(): number {
  return useSyncExternalStore(
    onResize,
    () => window.innerHeight,
    () => 0
  );
}
