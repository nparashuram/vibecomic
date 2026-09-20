/** What is highlighted on the page: a panel, and optionally one layer or bubble inside it. */
export interface Selection {
  panelId: string | null;
  layerId?: string;
  bubbleId?: string;
}
