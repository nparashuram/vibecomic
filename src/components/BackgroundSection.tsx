import type { MediaItem, Panel } from '../types/comic';
import LayerRow from './LayerRow';
import MediaPicker from './MediaPicker';
import { addMediaLayer, uploadImage } from './panelActions';
import type { Selection } from './selection';
import { useTask } from './useTask';
import type { Expansion } from './useExpansion';

interface Props {
  panel: Panel;
  media: MediaItem[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  expansion: Expansion;
}

/** The panel's background: a button to set one, or a row for the one that is set. */
export default function BackgroundSection({ panel, media, selection, onSelect, expansion }: Props) {
  const task = useTask();
  const background = panel.layers.find((layer) => layer.kind === 'background');
  const set = (getItem: () => Promise<MediaItem> | MediaItem) =>
    void task.run(async () => addMediaLayer(panel.id, await getItem(), 'background'));

  return (
    <section className="mb-3" aria-label="Background">
      <h3 className="h6">Background</h3>
      {background ? (
        <LayerRow
          panelId={panel.id}
          layer={background}
          media={media}
          selected={selection.layerId === background.id}
          expanded={expansion.isOpen(background.id)}
          onSelect={() =>
            onSelect({
              panelId: panel.id,
              layerId: selection.layerId === background.id ? undefined : background.id,
            })
          }
          onToggleExpanded={() => expansion.toggle(background.id)}
        />
      ) : (
        <MediaPicker
          label="Set background"
          busy={task.busy}
          media={media}
          onUpload={(file) => set(() => uploadImage(file))}
          onPick={(item) => set(() => item)}
        />
      )}
      {task.error && <div className="text-danger small mt-2">{task.error}</div>}
    </section>
  );
}
