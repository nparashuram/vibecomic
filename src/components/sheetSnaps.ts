/** The heights the mobile bottom sheet rests at. */
export const SNAPS = ['closed', 'half', 'full'] as const;
export type Snap = (typeof SNAPS)[number];
