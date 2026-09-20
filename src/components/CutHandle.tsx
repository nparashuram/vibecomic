import { useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { splitRect } from '../state/layout';
import type { Axis, Rect } from '../state/layout';
import { usePointerDrag } from '../utils/drag';
import { clamp, pointerPercent } from '../utils/geometry';
import { ScissorsIcon } from './Icons';

/** Fractions of the panel (in percent) that a cut snaps to, and how close counts. */
const SNAP_POINTS = [25, 100 / 3, 50, 200 / 3, 75];
const SNAP_DISTANCE = 1.5;
/** How far (in screen pixels) beside the panel a cut may be dropped and still count as on it. */
const SIDE_SLOP_PX = 40;
/** A press that moves less than this many pixels is not a cut. */
const MOVE_SLOP_PX = 4;

interface Cut {
  /** Where along the panel the cut falls, in percent of the panel. */
  position: number;
  /** Where that is on the page, in percent (the handle and the line sit here). */
  coordinate: number;
  /** Dropping here would cut. False when outside the panel or too close to an edge. */
  valid: boolean;
}

interface Props {
  /** "horizontal" cuts into a top and bottom part; its scissors sit on the panel's left edge. "vertical" sits on the top edge. */
  axis: Axis;
  /** The highlighted panel's rectangle, in percent of the page. */
  rect: Rect;
  sheetRef: RefObject<HTMLDivElement | null>;
  onCut: (position: number) => void;
}

/**
 * Scissors on the edge of the highlighted panel. Press and drag along the
 * panel: a dotted line shows where the cut would fall. Let go over the panel
 * and it is cut there; let go outside the panel and nothing happens. Nothing
 * else on the page cuts a panel, so stray clicks never do.
 */
export default function CutHandle({ axis, rect, sheetRef, onCut }: Props) {
  const horizontal = axis === 'horizontal';
  const [cut, setCut] = useState<Cut | null>(null);

  // "Along" is the direction the scissors travel (and the cut position is measured in).
  const alongStart = horizontal ? rect.y : rect.x;
  const alongLength = horizontal ? rect.height : rect.width;
  const acrossStart = horizontal ? rect.x : rect.y;
  const acrossLength = horizontal ? rect.width : rect.height;

  function cutAt(event: { clientX: number; clientY: number }): Cut {
    const sheet = sheetRef.current!;
    const box = sheet.getBoundingClientRect();
    const at = pointerPercent(sheet, event);
    const along = horizontal ? at.y : at.x;
    const across = horizontal ? at.x : at.y;
    const slop = (SIDE_SLOP_PX / (horizontal ? box.width : box.height)) * 100;

    const raw = ((along - alongStart) / alongLength) * 100;
    const position = SNAP_POINTS.find((p) => Math.abs(p - raw) < SNAP_DISTANCE) ?? raw;
    let valid =
      along > alongStart &&
      along < alongStart + alongLength &&
      across > acrossStart - slop &&
      across < acrossStart + acrossLength + slop;
    if (valid) {
      try {
        splitRect(rect, axis, position);
      } catch {
        valid = false; // one part would be too small
      }
    }
    const coordinate = clamp(
      alongStart + (alongLength * position) / 100,
      alongStart,
      alongStart + alongLength
    );
    return { position, coordinate, valid };
  }

  const drag = usePointerDrag<{ from: { x: number; y: number }; moved: boolean; latest: Cut }>({
    start: (event) => {
      const latest = cutAt(event);
      setCut(latest);
      return { from: { x: event.clientX, y: event.clientY }, moved: false, latest };
    },
    move: (event, state) => {
      if (Math.hypot(event.clientX - state.from.x, event.clientY - state.from.y) > MOVE_SLOP_PX) {
        state.moved = true;
      }
      state.latest = cutAt(event);
      setCut(state.latest);
    },
    end: (_, state) => {
      setCut(null);
      if (state.moved && state.latest.valid) onCut(state.latest.position);
    },
    cancel: () => setCut(null),
  });

  const coordinate = cut?.coordinate ?? alongStart + alongLength / 2;
  const handleStyle: CSSProperties = horizontal
    ? { left: `${rect.x}%`, top: `${coordinate}%`, transform: 'translate(-75%, -50%)' }
    : { left: `${coordinate}%`, top: `${rect.y}%`, transform: 'translate(-50%, -75%)' };
  const lineStyle: CSSProperties = horizontal
    ? { left: `${rect.x}%`, width: `${rect.width}%`, top: `${coordinate}%` }
    : { top: `${rect.y}%`, height: `${rect.height}%`, left: `${coordinate}%` };
  const label = horizontal ? 'Cut horizontally' : 'Cut vertically';

  return (
    <>
      {cut && (
        <div className={`cut-line ${axis}${cut.valid ? '' : ' invalid'}`} style={lineStyle} />
      )}
      <div
        data-scissors
        className={`cut-handle ${axis}${cut ? ' dragging' : ''}${cut && !cut.valid ? ' invalid' : ''}`}
        style={handleStyle}
        title={label}
        aria-label={label}
        {...drag}
      >
        <ScissorsIcon turn={horizontal ? 0 : 90} />
      </div>
    </>
  );
}
