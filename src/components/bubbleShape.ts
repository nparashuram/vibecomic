import type { Point } from '../utils/geometry';

interface Box extends Point {
  width: number;
  height: number;
}

interface PointerShape {
  /** Where the pointer leaves the bubble. */
  edge: Point;
  tip: Point;
  /** The two corners of the wedge on the bubble's edge. */
  base: [Point, Point];
  /** The same corners pushed inside the bubble, to cover its border under the wedge. */
  inner: [Point, Point];
  /** Unit vector from the bubble's centre toward the tip. */
  direction: Point;
  /** Distance from the edge to the tip. */
  length: number;
}

/**
 * The geometry of a bubble's pointer, in pixels: a wedge from the point where
 * the line from the bubble's centre to `tip` crosses its edge. Null when the
 * tip lies inside the bubble.
 */
export function pointerShape(box: Box, tip: Point): PointerShape | null {
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const dx = tip.x - centre.x;
  const dy = tip.y - centre.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return null;

  const direction = { x: dx / distance, y: dy / distance };
  const reach = Math.min(
    direction.x ? box.width / 2 / Math.abs(direction.x) : Infinity,
    direction.y ? box.height / 2 / Math.abs(direction.y) : Infinity
  );
  if (reach >= distance) return null;

  const edge = { x: centre.x + direction.x * reach, y: centre.y + direction.y * reach };
  const half = Math.min(16, Math.max(4, Math.min(box.width, box.height) * 0.16));
  const normal = { x: -direction.y, y: direction.x };
  const shifted = (from: Point, along: number, across: number): Point => ({
    x: from.x + direction.x * along + normal.x * across,
    y: from.y + direction.y * along + normal.y * across,
  });

  return {
    edge,
    tip,
    base: [shifted(edge, 0, half), shifted(edge, 0, -half)],
    inner: [shifted(edge, -6, half), shifted(edge, -6, -half)],
    direction,
    length: distance - reach,
  };
}
