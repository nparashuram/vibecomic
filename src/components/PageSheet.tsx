import { useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { cb } from '../ai/actions';
import { findDividers, moveEdge, rectOf } from '../state/layout';
import type { Divider, Rect } from '../state/layout';
import type { ComicPage, PageSize } from '../types/comic';
import { usePointerDrag } from '../utils/drag';
import { pointerPercent } from '../utils/geometry';
import type { Point } from '../utils/geometry';
import CutHandle from './CutHandle';
import PanelView from './PanelView';
import type { Selection } from './selection';

interface PageEditing {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** A tap (a press that barely moves) anywhere on the page area, including on layers and bubbles. */
  onTap?: () => void;
}

interface Props {
  page: ComicPage;
  pageSize: PageSize;
  editing?: PageEditing;
}

/** Screen pixels a press may move and still count as a tap. */
const TAP_SLOP_PX = 6;

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
 * - the highlighted panel has scissors on its left edge and top edge: drag
 *   one along the panel and let go over it to cut it (nothing else cuts);
 * - drag the lines between panels to resize them.
 */
export default function PageSheet({ page, pageSize, editing }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const pressStart = useRef<Point | null>(null);
  const [resizePreview, setResizePreview] = useState<Rect[] | null>(null);

  const committed = useMemo(() => page.panels.map(rectOf), [page.panels]);
  const rects = resizePreview ?? committed;
  const dividers = useMemo(() => (editing ? findDividers(rects) : []), [editing, rects]);

  // A click (a press that does not move) highlights the panel under it, or the layer in the highlighted panel.
  const sheetDrag = usePointerDrag<{
    index: number;
    layerId?: string;
    from: Point;
    moved: boolean;
  }>({
    start: (event) => {
      if (!editing) return null;
      const index = rects.findIndex((r) => contains(r, pointerPercent(sheetRef.current!, event)));
      if (index < 0) return null;
      const layerId = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset
        .layerId;
      return { index, layerId, from: { x: event.clientX, y: event.clientY }, moved: false };
    },
    move: (event, state) => {
      if (Math.hypot(event.clientX - state.from.x, event.clientY - state.from.y) > TAP_SLOP_PX) {
        state.moved = true;
      }
    },
    end: (_, state) => {
      if (state.moved) return;
      const panel = page.panels[state.index];
      const layerId = editing?.selection.panelId === panel.id ? state.layerId : undefined;
      editing?.onSelect({ panelId: panel.id, layerId });
    },
  });

  const selection = editing?.selection;
  const selectedPanel = page.panels.find((panel) => panel.id === selection?.panelId);
  // Paint the highlighted panel last so whatever spills out of it stays visible.
  const paintOrder = page.panels
    .map((panel, i) => ({ panel, i }))
    .sort(
      (a, b) =>
        Number(selection?.panelId === a.panel.id) - Number(selection?.panelId === b.panel.id)
    );
  return (
    <div
      className="page-area"
      onPointerDownCapture={
        editing
          ? (event) => (pressStart.current = { x: event.clientX, y: event.clientY })
          : undefined
      }
      onPointerUpCapture={
        editing
          ? (event) => {
              const start = pressStart.current;
              pressStart.current = null;
              const moved = start && Math.hypot(event.clientX - start.x, event.clientY - start.y);
              // Pressing the scissors is not a tap on the page.
              const onScissors = (event.target as Element).closest('[data-scissors]');
              if (moved !== null && moved !== undefined && moved < TAP_SLOP_PX && !onScissors) {
                editing.onTap?.();
              }
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

        {editing &&
          selectedPanel &&
          (['horizontal', 'vertical'] as const).map((axis) => (
            <CutHandle
              key={`${selectedPanel.id}-${axis}`}
              axis={axis}
              rect={rects[page.panels.indexOf(selectedPanel)]}
              sheetRef={sheetRef}
              onCut={(position) => {
                cb().panels.split(selectedPanel.id, axis, position);
                editing.onSelect({ panelId: selectedPanel.id });
              }}
            />
          ))}

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
