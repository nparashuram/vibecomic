import { ChevronIcon, TrashIcon } from './Icons';

/** The chevron that shows or hides a row's details. */
export function ExpandButton({
  expanded,
  label,
  onClick,
}: {
  expanded: boolean;
  label: string;
  onClick: () => void;
}) {
  const action = expanded ? 'Collapse' : 'Expand';
  return (
    <button
      className="btn btn-link btn-sm p-0 text-secondary"
      title={action}
      aria-label={`${action} ${label}`}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <ChevronIcon open={expanded} />
    </button>
  );
}

/** The trash-can button that deletes a row's item. */
export function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="btn btn-outline-secondary btn-sm px-2"
      title={`Delete ${label}`}
      aria-label={`Delete ${label}`}
      onClick={onClick}
    >
      <TrashIcon />
    </button>
  );
}
