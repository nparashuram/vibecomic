import { useState } from 'react';
import { cb } from '../ai/actions';
import type { ComicPage, MediaItem, Panel } from '../types/comic';
import { errorMessage } from '../utils/errors';
import BackgroundSection from './BackgroundSection';
import BubblesSection from './BubblesSection';
import LayersSection from './LayersSection';
import { TrashIcon } from './Icons';
import type { Selection } from './selection';
import { useExpansion } from './useExpansion';

const SPLIT_COUNTS = [2, 3, 4];

interface Props {
  page: ComicPage;
  panel: Panel;
  media: MediaItem[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

function SplitControls({ panel }: { panel: Panel }) {
  const [error, setError] = useState('');

  function split(axis: 'horizontal' | 'vertical', count: number) {
    try {
      cb().panels.splitEvenly(panel.id, axis, count);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="mb-3">
      <h3 className="h6">Split evenly</h3>
      {(
        [
          ['horizontal', 'Rows'],
          ['vertical', 'Columns'],
        ] as const
      ).map(([axis, label]) => (
        <div key={axis} className="d-flex align-items-center gap-2 mb-1">
          <span className="small" style={{ width: 64 }}>
            {label}
          </span>
          <div className="btn-group btn-group-sm">
            {SPLIT_COUNTS.map((count) => (
              <button
                key={count}
                className="btn btn-outline-secondary"
                onClick={() => split(axis, count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <div className="text-danger small mt-1">{error}</div>}
    </section>
  );
}

/** Everything you can do to the highlighted panel: delete it, split it, and edit its content. */
export default function PanelInspector({ page, panel, media, selection, onSelect }: Props) {
  const expansion = useExpansion();
  const size = cb().panels.size(panel.id);
  const hasContent = panel.layers.length > 0 || panel.bubbles.length > 0;
  const onlyPanel = page.panels.length === 1;

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="fw-semibold">Panel {page.panels.indexOf(panel) + 1}</div>
          {size && (
            <div className="text-muted small">
              {size.widthIn}″ × {size.heightIn}″ · ratio {size.aspectRatio}
            </div>
          )}
        </div>
        <button
          className="btn btn-outline-secondary btn-sm text-nowrap flex-shrink-0"
          disabled={onlyPanel}
          title={onlyPanel ? 'A page needs at least one panel' : undefined}
          onClick={() => {
            if (!hasContent || window.confirm('Delete this panel and everything in it?')) {
              cb().panels.delete(panel.id);
            }
          }}
        >
          <TrashIcon /> Delete panel
        </button>
      </div>

      <BubblesSection
        panel={panel}
        selection={selection}
        onSelect={onSelect}
        expansion={expansion}
      />
      <LayersSection
        panel={panel}
        media={media}
        selection={selection}
        onSelect={onSelect}
        expansion={expansion}
      />
      <BackgroundSection
        panel={panel}
        media={media}
        selection={selection}
        onSelect={onSelect}
        expansion={expansion}
      />
      <SplitControls panel={panel} />
    </div>
  );
}
