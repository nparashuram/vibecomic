export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Point {
  x: number;
  y: number;
}

/** Where a pointer event is inside an element, as percentages of the element's size. */
export function pointerPercent(
  element: Element,
  event: { clientX: number; clientY: number }
): Point {
  const rect = element.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
}

/** A rectangle as percentages of its container. */
interface PercentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];

/**
 * Drag one corner of a box by (dx, dy) with the opposite corner fixed, keeping
 * the box inside its container and at least `min` wide and tall.
 */
export function resizeBox(box: PercentBox, corner: Corner, dx: number, dy: number, min = 8) {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const left = corner.includes('w') ? clamp(box.x + dx, 0, right - min) : box.x;
  const newRight = corner.includes('e') ? clamp(right + dx, box.x + min, 100) : right;
  const top = corner.includes('n') ? clamp(box.y + dy, 0, bottom - min) : box.y;
  const newBottom = corner.includes('s') ? clamp(bottom + dy, box.y + min, 100) : bottom;
  return {
    x: round1(left),
    y: round1(top),
    width: round1(newRight - left),
    height: round1(newBottom - top),
  };
}
