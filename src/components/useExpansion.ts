import { useState } from 'react';

/** Which rows of the inspector are expanded, independent of what is selected. */
export function useExpansion() {
  const [open, setOpen] = useState<Set<string>>(new Set());

  return {
    isOpen: (id: string) => open.has(id),
    toggle: (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    setAll: (ids: string[], expanded: boolean) =>
      setOpen((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (expanded) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
  };
}

export type Expansion = ReturnType<typeof useExpansion>;
