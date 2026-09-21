/** The list with the item that has `id` moved to position `to` (the others keep their order). */
export function moved<T extends { id: string }>(list: T[], id: string, to: number): T[] {
  const item = list.find((entry) => entry.id === id);
  if (!item) return list;
  const rest = list.filter((entry) => entry !== item);
  rest.splice(to, 0, item);
  return rest;
}

/**
 * Where a dragged item would land: the number of the other items whose midpoint
 * is before the pointer. `midpoints` are the other items' centres along the
 * drag axis; the result is a position among the others, 0 for the very start.
 */
export function slotAt(midpoints: number[], pointer: number): number {
  return midpoints.filter((mid) => mid < pointer).length;
}
