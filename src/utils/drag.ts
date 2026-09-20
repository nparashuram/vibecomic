import { useRef } from 'react';
import type { PointerEvent } from 'react';

export interface DragOptions<S> {
  /** Return the drag state to begin a drag, or null to ignore the press. */
  start: (event: PointerEvent) => S | null;
  move: (event: PointerEvent, state: S) => void;
  end: (event: PointerEvent, state: S) => void;
  cancel?: () => void;
}

/** Pointer-capture drag handlers to spread onto an element. */
export function usePointerDrag<S>({ start, move, end, cancel }: DragOptions<S>) {
  const active = useRef<S | null>(null);

  return {
    onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const state = start(event);
      if (state === null) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      active.current = state;
    },
    onPointerMove(event: PointerEvent) {
      if (active.current !== null) move(event, active.current);
    },
    onPointerUp(event: PointerEvent) {
      if (active.current === null) return;
      const state = active.current;
      active.current = null;
      end(event, state);
    },
    onPointerCancel() {
      if (active.current === null) return;
      active.current = null;
      cancel?.();
    },
  };
}
