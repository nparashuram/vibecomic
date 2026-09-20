import type { ReactNode } from 'react';

interface MenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggle: ReactNode;
  toggleClassName: string;
  toggleLabel?: string;
  toggleDisabled?: boolean;
  /** Which edge of the toggle the menu lines up with. */
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}

/**
 * Bootstrap dropdown, opened and closed by React state. The menu sits directly
 * under its toggle; clicking outside it or on one of its items closes it.
 */
export default function DropdownMenu({
  open,
  onOpenChange,
  toggle,
  toggleClassName,
  toggleLabel,
  toggleDisabled,
  align = 'start',
  className = '',
  children,
}: MenuProps) {
  return (
    <div className={`dropdown ${className}`}>
      <button
        type="button"
        className={toggleClassName}
        aria-label={toggleLabel}
        disabled={toggleDisabled}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {toggle}
      </button>
      {open && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ zIndex: 999 }}
            onClick={() => onOpenChange(false)}
          />
          <ul
            className={`dropdown-menu show${align === 'end' ? ' dropdown-menu-end' : ''}`}
            data-bs-popper="static"
            style={{ maxHeight: 260, overflowY: 'auto' }}
            onClick={() => onOpenChange(false)}
          >
            {children}
          </ul>
        </>
      )}
    </div>
  );
}

export function DropdownItem({
  active = false,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button type="button" className={`dropdown-item${active ? ' active' : ''}`} onClick={onClick}>
        {children}
      </button>
    </li>
  );
}
