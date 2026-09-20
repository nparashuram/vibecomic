import type { MediaItem } from '../types/comic';
import { driveFileIdFromUrl } from '../utils/driveUrl';
import Spinner from './Spinner';
import { useMediaUrl } from './useMediaUrl';

interface Props {
  /** Drive URL of the image shown, or '' when there is none yet. */
  src: string;
  /** The registered image behind `src`, when known: its thumbnail is shown instead of the full file. */
  item?: MediaItem;
  /** Names the button for screen readers, e.g. "Change background image". */
  label: string;
  busy: boolean;
  onClick: () => void;
}

/** The image a layer uses, as a thumbnail that opens the media picker when clicked. */
export default function MediaSlot({ src, item, label, busy, onClick }: Props) {
  const fileId = src ? driveFileIdFromUrl(src) : null;
  const { url } = useMediaUrl(item ?? (fileId ? { driveFileId: fileId } : null));
  return (
    <button
      type="button"
      className="media-slot checker"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={onClick}
    >
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span className="text-muted small">{src ? '…' : 'Add image'}</span>
      )}
      {busy && (
        <span className="media-slot-busy">
          <Spinner />
        </span>
      )}
    </button>
  );
}
