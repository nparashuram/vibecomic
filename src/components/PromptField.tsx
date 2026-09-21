interface Props {
  /** Unique on the screen: ties the label and the help text to the box. */
  id: string;
  label: string;
  /** Keep the label for screen readers but not on screen (a heading already says it). */
  hideLabel?: boolean;
  placeholder: string;
  /** One line saying what the prompt is for. */
  help: string;
  value: string;
  onChange: (value: string) => void;
}

/** A labelled box for the prompt (the intent) of a page or a panel. */
export default function PromptField({
  id,
  label,
  hideLabel,
  placeholder,
  help,
  value,
  onChange,
}: Props) {
  return (
    <div className="mb-3">
      <label
        className={`form-label fw-semibold small mb-1${hideLabel ? ' visually-hidden' : ''}`}
        htmlFor={id}
      >
        {label}
      </label>
      <textarea
        id={id}
        className="form-control form-control-sm"
        rows={3}
        value={value}
        placeholder={placeholder}
        aria-describedby={`${id}-help`}
        onChange={(e) => onChange(e.target.value)}
      />
      <div id={`${id}-help`} className="form-text">
        {help}
      </div>
    </div>
  );
}
