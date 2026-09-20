import type { MediaItem } from '../types/comic';
import { useMediaUrl } from './useMediaUrl';

interface Props {
  item: MediaItem;
  onRemove: () => void;
  /** Called when the image itself is clicked (e.g. to enlarge it). */
  onOpen?: () => void;
}

/** A square thumbnail of a media item, with a button to remove it. */
export default function MediaThumb({ item, onRemove, onOpen }: Props) {
  const { url, failed, error } = useMediaUrl(item);

  return (
    <div className="position-relative" style={{ width: 72, height: 72 }}>
      {url ? (
        <button
          type="button"
          className="p-0 border-0 bg-transparent w-100 h-100"
          style={{ cursor: onOpen ? 'zoom-in' : undefined }}
          aria-label={`Enlarge ${item.name}`}
          disabled={!onOpen}
          onClick={onOpen}
        >
          <img
            src={url}
            alt=""
            title={item.name}
            className="img-thumbnail w-100 h-100"
            style={{ objectFit: 'cover' }}
          />
        </button>
      ) : (
        <div
          className="border rounded w-100 h-100 d-flex align-items-center justify-content-center text-muted small"
          title={error ?? undefined}
        >
          {failed ? 'Failed' : '…'}
        </div>
      )}
      <button
        type="button"
        className="btn btn-light btn-sm position-absolute top-0 end-0 m-1 p-0 lh-1 rounded-circle border"
        style={{ width: 20, height: 20 }}
        aria-label={`Remove ${item.name}`}
        title="Remove from this entry"
        onClick={onRemove}
      >
        &times;
      </button>
    </div>
  );
}
