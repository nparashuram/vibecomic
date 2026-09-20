import { useState } from 'react';
import { cb } from '../ai/actions';
import type { BubblePatch, LayerPatch } from '../ai/deps';
import type { Panel } from '../types/comic';
import { useElementSize } from '../utils/useElementSize';
import BubbleView from './BubbleView';
import LayerBox from './LayerBox';

interface PanelEditing {
  selectedLayerId: string | null;
  selectedBubbleId: string | null;
  onSelectBubble: (id: string) => void;
}

interface Props {
  panel: Panel;
  /** Panel number badge, drawn beneath the panel's own layers and bubbles. */
  number?: number;
  /** When set, the selected layer and bubbles can be moved and resized. */
  editing?: PanelEditing;
}

/** Fills its parent with one panel: layers bottom-to-top (array order), then bubbles above them all. */
export default function PanelView({ panel, number, editing }: Props) {
  const [canvasRef, canvasSize] = useElementSize<HTMLDivElement>();
  const [layerPreview, setLayerPreview] = useState<{ id: string; patch: LayerPatch } | null>(null);
  const [bubblePreview, setBubblePreview] = useState<{ id: string; patch: BubblePatch } | null>(
    null
  );
  const layers = panel.layers.filter((layer) => layer.visible);
  const hasArt = panel.layers.some((layer) => layer.visible && layer.src);

  return (
    <div className="panel-canvas" ref={canvasRef}>
      {number !== undefined && <span className="panel-number">{number}</span>}
      {!hasArt && <div className="panel-empty">No artwork yet</div>}
      {layers.map((layer) => (
        <LayerBox
          key={layer.id}
          layer={layerPreview?.id === layer.id ? { ...layer, ...layerPreview.patch } : layer}
          canvasRef={canvasRef}
          editing={
            editing && {
              selected: editing.selectedLayerId === layer.id,
              onPreview: (patch) => setLayerPreview({ id: layer.id, patch }),
              onCommit: (patch) => {
                cb().layers.update(panel.id, layer.id, patch);
                setLayerPreview(null);
              },
            }
          }
        />
      ))}
      {panel.bubbles.map((bubble) => (
        <BubbleView
          key={bubble.id}
          bubble={bubblePreview?.id === bubble.id ? { ...bubble, ...bubblePreview.patch } : bubble}
          canvasRef={canvasRef}
          canvasSize={canvasSize}
          editing={
            editing && {
              selected: editing.selectedBubbleId === bubble.id,
              onSelect: () => editing.onSelectBubble(bubble.id),
              onPreview: (patch) => setBubblePreview({ id: bubble.id, patch }),
              onCommit: (patch) => {
                cb().bubbles.update(panel.id, bubble.id, patch);
                setBubblePreview(null);
              },
            }
          }
        />
      ))}
    </div>
  );
}
