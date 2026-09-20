import { usePointerDrag } from '../utils/drag';
import type { DragOptions } from '../utils/drag';
import type { Corner } from '../utils/geometry';

/** A square handle on one corner of a selected box; dragging it resizes the box. */
export default function CornerHandle<S>({ corner, ...drag }: DragOptions<S> & { corner: Corner }) {
  return <div className={`resize-handle ${corner}`} {...usePointerDrag(drag)} />;
}
