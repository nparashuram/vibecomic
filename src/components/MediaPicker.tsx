import { useRef, useState } from 'react';
import type { MediaItem } from '../types/comic';
import DropdownMenu, { DropdownItem } from './DropdownMenu';
import Spinner from './Spinner';

interface Props {
  label: string;
  /** Shows a spinner and disables the button while an image is being added. */
  busy: boolean;
  media: MediaItem[];
  onUpload: (file: File) => void;
  onPick: (item: MediaItem) => void;
}

/** One button to add an image: upload a new file or pick one already in the project. */
export default function MediaPicker({ label, busy, media, onUpload, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const content = (
    <>
      {busy && <Spinner />}
      {label}
    </>
  );
  const buttonClass = 'btn btn-outline-secondary btn-sm';

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="d-none"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUpload(file);
        }}
      />
      {media.length === 0 ? (
        <button className={buttonClass} disabled={busy} onClick={() => fileInput.current?.click()}>
          {content}
        </button>
      ) : (
        <DropdownMenu
          open={open}
          onOpenChange={setOpen}
          toggle={content}
          toggleClassName={`${buttonClass} dropdown-toggle`}
          toggleDisabled={busy}
        >
          <DropdownItem onClick={() => fileInput.current?.click()}>Upload new image…</DropdownItem>
          <li>
            <hr className="dropdown-divider" />
          </li>
          {media.map((item) => (
            <DropdownItem key={item.id} onClick={() => onPick(item)}>
              {item.name}
            </DropdownItem>
          ))}
        </DropdownMenu>
      )}
    </>
  );
}
