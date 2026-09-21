/** A small red dot: something here clashes with changes made elsewhere. */
export default function ConflictDot({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`d-inline-block rounded-circle bg-danger ${className}`}
      style={{ width: 8, height: 8, ...style }}
      role="img"
      aria-label="Has a conflict"
    />
  );
}
