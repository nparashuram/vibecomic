import { cb } from '../ai/actions';
import type { LayerPatch } from '../ai/deps';
import type { Layer, MediaItem } from '../types/comic';
import { uploadImage, setLayerMedia } from './panelActions';
import MediaPicker from './MediaPicker';
import SliderRow from './SliderRow';
import { useTask } from './useTask';

interface Props {
  panelId: string;
  layer: Layer;
  media: MediaItem[];
}

/** The editable properties of one layer: name, prompt, image and opacity. Place, size and turn it on the page. */
export default function LayerDetails({ panelId, layer, media }: Props) {
  const task = useTask();
  const update = (patch: LayerPatch) => cb().layers.update(panelId, layer.id, patch);
  const size = cb().layers.size(panelId, layer.id);

  return (
    <div className="mt-2">
      <input
        className="form-control form-control-sm mb-2"
        value={layer.name}
        aria-label="Layer name"
        onChange={(e) => update({ name: e.target.value })}
      />
      <textarea
        className="form-control form-control-sm mb-2"
        rows={3}
        value={layer.prompt ?? ''}
        placeholder="Prompt or description"
        aria-label="Layer prompt"
        autoFocus={!layer.prompt && !layer.src}
        onChange={(e) => update({ prompt: e.target.value })}
      />
      <div className="d-flex align-items-center gap-2 mb-2">
        <MediaPicker
          label={layer.src ? 'Change image' : 'Add image'}
          busy={task.busy}
          media={media}
          onUpload={(file) =>
            void task.run(async () => setLayerMedia(panelId, layer.id, await uploadImage(file)))
          }
          onPick={(item) => void task.run(() => setLayerMedia(panelId, layer.id, item))}
        />
        {size && (
          <span className="text-muted small">
            {size.pixels.width} × {size.pixels.height} px
          </span>
        )}
      </div>
      {task.error && <div className="text-danger small mb-2">{task.error}</div>}
      <SliderRow
        label="Opacity"
        value={layer.opacity}
        min={0}
        max={1}
        step={0.05}
        onChange={(opacity) => update({ opacity })}
      />
    </div>
  );
}
