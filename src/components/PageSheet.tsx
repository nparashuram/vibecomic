import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { cb } from '../ai/actions';
import { cutAcross, findDividers, moveEdge, rectOf, splitRect } from '../state/layout';
import type { Axis, Divider, Rect } from '../state/layout';
import type { ComicPage, PageSize } from '../types/comic';
import { usePointerDrag } from '../utils/drag';
import { pointerPercent } from '../utils/geometry';
import type { Point } from '../utils/geometry';
import PanelView from './PanelView';
import type { Selection } from './selection';

interface PageEditing {
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

interface Props {
  page: ComicPage;
  pageSize: PageSize;
  editing?: PageEditing;
}

/** Screen pixels a drag must travel before it counts as drawing a line rather than a click. */
const DRAW_THRESHOLD_PX = 6;
/** Fractions (in percent) that a cut line snaps to, and how close counts. */
const SNAP_POINTS = [25, 100 / 3, 50, 200 / 3, 75];
const SNAP_DISTANCE = 1.5;

/** A cut line across the whole page, drawn while the cursor is beside or above/below the page. */
interface AcrossGuide {
  axis: Axis;
  /** Where the line falls across the page, in percent. */
  position: number;
  valid: boolean;
}

interface Guide {
  axis: Axis;
  rect: Rect;
  /** Where the line falls across the page, in percent. */
  coordinate: number;
  valid: boolean;
}

/** Snap a position to a common fraction, or to one of `extra` (such as existing panel edges). */
const snapTo = (position: number, extra: number[] = []) =>
  [...SNAP_POINTS, ...extra].find((point) => Math.abs(point - position) < SNAP_DISTANCE) ??
  position;

const contains = (r: Rect, p: Point) =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

interface DividerHandleProps {
  divider: Divider;
  committed: Rect[];
  sheetRef: RefObject<HTMLDivElement | null>;
  onPreview: (rects: Rect[] | null) => void;
  onCommit: (value: number) => void;
}

/** The draggable line between panels; dragging resizes every panel that touches it. */
function DividerHandle({ divider, committed, sheetRef, onPreview, onCommit }: DividerHandleProps) {
  const vertical = divider.orientation === 'vertical';
  const valueAt = (event: { clientX: number; clientY: number }) => {
    const at = pointerPercent(sheetRef.current!, event);
    return vertical ? at.x : at.y;
  };

  const drag = usePointerDrag<{ value: number }>({
    start: () => ({ value: divider.coordinate }),
    move: (event, state) => {
      state.value = valueAt(event);
      onPreview(moveEdge(committed, divider.panelIndex, divider.edge, state.value));
    },
    end: (_, state) => {
      onPreview(null);
      onCommit(state.value);
    },
    cancel: () => onPreview(null),
  });

  const style: CSSProperties = vertical
    ? {
        left: `${divider.coordinate}%`,
        top: `${divider.start}%`,
        height: `${divider.end - divider.start}%`,
      }
    : {
        top: `${divider.coordinate}%`,
        left: `${divider.start}%`,
        width: `${divider.end - divider.start}%`,
      };
  return <div className={`divider-handle ${divider.orientation}`} style={style} {...drag} />;
}

/**
 * A page at its real aspect ratio with its panels laid out on it. When
 * `editing`, this is the one place everything is edited:
 * - click a panel to highlight it; its layers and bubbles can then be moved
 *   and resized here (and edited in the inspector);
 * - move the cursor beside the page (left or right) for a horizontal cut line
 *   across the whole page, or above or below it for a vertical one, and click;
 * - drag across a single panel to cut just that panel in two;
 * - drag the lines between panels to resize them.
 */
export default function PageSheet({ page, pageSize, editing }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [resizePreview, setResizePreview] = useState<Rect[] | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [acrossGuide, setAcrossGuide] = useState<AcrossGuide | null>(null);

  const committed = useMemo(() => page.panels.map(rectOf), [page.panels]);
  const rects = resizePreview ?? committed;
  const dividers = useMemo(() => (editing ? findDividers(rects) : []), [editing, rects]);

  const sheetDrag = usePointerDrag<{
    index: number;
    from: Point;
    fromClient: Point;
    layerId?: string;
    cut?: { axis: Axis; position: number; valid: boolean };
  }>({
    start: (event) => {
      if (!editing) return null;
      const from = pointerPercent(sheetRef.current!, event);
      const index = rects.findIndex((r) => contains(r, from));
      if (index < 0) return null;
      const layerId = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset
        .layerId;
      return { index, from, fromClient: { x: event.clientX, y: event.clientY }, layerId };
    },
    move: (event, state) => {
      const dx = event.clientX - state.fromClient.x;
      const dy = event.clientY - state.fromClient.y;
      if (Math.hypot(dx, dy) < DRAW_THRESHOLD_PX) {
        state.cut = undefined;
        setGuide(null);
        return;
      }
      const axis: Axis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
      const at = pointerPercent(sheetRef.current!, event);
      const rect = rects[state.index];
      const [start, length, across] =
        axis === 'horizontal'
          ? [rect.y, rect.height, (state.from.y + at.y) / 2]
          : [rect.x, rect.width, (state.from.x + at.x) / 2];
      const position = snapTo(((across - start) / length) * 100);

      let valid = true;
      try {
        splitRect(rect, axis, position);
      } catch {
        valid = false;
      }
      state.cut = { axis, position, valid };
      setGuide({ axis, rect, coordinate: start + (length * position) / 100, valid });
    },
    end: (_, state) => {
      setGuide(null);
      const panel = page.panels[state.index];
      if (state.cut?.valid) cb().panels.split(panel.id, state.cut.axis, state.cut.position);
      // A click on a layer inside the already highlighted panel selects that layer.
      const layerId = editing?.selection.panelId === panel.id ? state.layerId : undefined;
      editing?.onSelect({ panelId: panel.id, layerId });
    },
    cancel: () => setGuide(null),
  });

  /**
   * The cut line for a cursor outside the page: beside it (left or right) is a
   * horizontal cut at the cursor's height; above or below it is a vertical cut at
   * the cursor's x. Null over the page or in the corners.
   */
  function acrossCutAt(event: { clientX: number; clientY: number }): AcrossGuide | null {
    const sheet = sheetRef.current!.getBoundingClientRect();
    const withinX = event.clientX >= sheet.left && event.clientX <= sheet.right;
    const withinY = event.clientY >= sheet.top && event.clientY <= sheet.bottom;
    if (withinX === withinY) return null;

    const axis: Axis = withinY ? 'horizontal' : 'vertical';
    const at = pointerPercent(sheetRef.current!, event);
    const edges = rects.flatMap((r) => (withinY ? [r.y, r.y + r.height] : [r.x, r.x + r.width]));
    const position = snapTo(withinY ? at.y : at.x, edges);

    let valid = true;
    try {
      cutAcross(committed, axis, position);
    } catch {
      valid = false;
    }
    return { axis, position, valid };
  }

  const insideSheet = (event: { target: EventTarget }) =>
    sheetRef.current?.contains(event.target as Node) ?? false;

  const selection = editing?.selection;
  // Paint the highlighted panel last so whatever spills out of it stays visible.
  const paintOrder = page.panels
    .map((panel, i) => ({ panel, i }))
    .sort(
      (a, b) =>
        Number(selection?.panelId === a.panel.id) - Number(selection?.panelId === b.panel.id)
    );
  return (
    <div
      className={`page-area${acrossGuide ? ` cut-${acrossGuide.axis}` : ''}`}
      onPointerMove={
        editing
          ? (event) => setAcrossGuide(insideSheet(event) ? null : acrossCutAt(event))
          : undefined
      }
      onPointerLeave={editing ? () => setAcrossGuide(null) : undefined}
      onPointerDown={
        editing
          ? (event) => {
              if (insideSheet(event)) return;
              const cut = acrossCutAt(event);
              if (cut?.valid) cb().panels.splitAcross(cut.axis, cut.position);
            }
          : undefined
      }
    >
      <div
        ref={sheetRef}
        className={`page-sheet${editing ? ' editing' : ''}`}
        style={{ '--page-ratio': pageSize.widthIn / pageSize.heightIn } as CSSProperties}
        {...(editing ? sheetDrag : {})}
      >
        {paintOrder.map(({ panel, i }) => {
          const r = rects[i];
          const selected = selection?.panelId === panel.id;
          return (
            <div
              key={panel.id}
              className={`page-panel${selected ? ' selected' : ''}`}
              style={{
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
              }}
            >
              <PanelView
                panel={panel}
                number={editing ? i + 1 : undefined}
                editing={
                  selected && editing
                    ? {
                        selectedLayerId: selection.layerId ?? null,
                        selectedBubbleId: selection.bubbleId ?? null,
                        onSelectBubble: (bubbleId) =>
                          editing.onSelect({ panelId: panel.id, bubbleId }),
                      }
                    : undefined
                }
              />
            </div>
          );
        })}

        {guide && (
          <div
            className={`split-guide ${guide.axis}${guide.valid ? '' : ' invalid'}`}
            style={
              guide.axis === 'horizontal'
                ? {
                    left: `${guide.rect.x}%`,
                    width: `${guide.rect.width}%`,
                    top: `${guide.coordinate}%`,
                  }
                : {
                    top: `${guide.rect.y}%`,
                    height: `${guide.rect.height}%`,
                    left: `${guide.coordinate}%`,
                  }
            }
          />
        )}

        {acrossGuide && (
          <div
            className={`split-guide across ${acrossGuide.axis}${acrossGuide.valid ? '' : ' invalid'}`}
            style={
              acrossGuide.axis === 'horizontal'
                ? { top: `${acrossGuide.position}%` }
                : { left: `${acrossGuide.position}%` }
            }
          />
        )}

        {dividers.map((divider) => (
          <DividerHandle
            key={`${divider.orientation}-${divider.panelIndex}-${divider.edge}`}
            divider={divider}
            committed={committed}
            sheetRef={sheetRef}
            onPreview={setResizePreview}
            onCommit={(value) =>
              cb().panels.resize(page.panels[divider.panelIndex].id, divider.edge, value)
            }
          />
        ))}
      </div>
    </div>
  );
}
