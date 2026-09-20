import { useEffect, useState } from 'react';
import type { MediaItem } from '../types/comic';
import { loadBlobUrl } from './mediaImages';

interface Props {
  item: MediaItem;
  onRemove: () => void;
}

/** A square thumbnail of a media item, with a button to remove it. */
export default function MediaThumb({ item, onRemove }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    loadBlobUrl(item.driveFileId).then(
      (url) => current && setSrc(url),
      () => current && setFailed(true)
    );
    return () => {
      current = false;
    };
  }, [item.driveFileId]);

  return (
    <div className="position-relative" style={{ width: 72, height: 72 }}>
      {src ? (
        <img
          src={src}
          alt={item.name}
          title={item.name}
          className="img-thumbnail w-100 h-100"
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <div className="border rounded w-100 h-100 d-flex align-items-center justify-content-center text-muted small">
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
