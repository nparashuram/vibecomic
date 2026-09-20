import { useState } from 'react';
import { cb } from '../ai/actions';
import type { SaveState } from '../state/useProjectSaver';
import DropdownMenu, { DropdownItem } from './DropdownMenu';
import { EDITOR_TABS } from './editorTabs';
import type { EditorTab } from './editorTabs';
import SaveButton from './SaveButton';

interface Props {
  title: string;
  tab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  saveState: SaveState;
  dirty: boolean;
}

type OpenMenu = 'main' | 'tabs' | null;

export default function EditorNavbar({ title, tab, onTabChange, saveState, dirty }: Props) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const menuProps = (menu: Exclude<OpenMenu, null>) => ({
    open: openMenu === menu,
    onOpenChange: (open: boolean) => setOpenMenu(open ? menu : null),
    className: 'd-md-none',
  });

  return (
    <nav className="navbar navbar-dark bg-dark flex-nowrap gap-2 px-3">
      <DropdownMenu
        {...menuProps('main')}
        toggle={<span className="navbar-toggler-icon" />}
        toggleClassName="btn btn-outline-light btn-sm"
        toggleLabel="Menu"
      >
        <DropdownItem onClick={() => void cb().storage.showProjects()}>Open project</DropdownItem>
        <DropdownItem onClick={() => cb().page.openPreview()}>Preview this page</DropdownItem>
        <DropdownItem onClick={() => void cb().storage.closeProject()}>Close project</DropdownItem>
      </DropdownMenu>

      <span className="navbar-brand mb-0 h1 fs-5 text-truncate me-auto">{title}</span>

      <DropdownMenu
        {...menuProps('tabs')}
        align="end"
        toggle={EDITOR_TABS.find((t) => t.id === tab)?.label}
        toggleClassName="btn btn-outline-light btn-sm dropdown-toggle"
      >
        {EDITOR_TABS.map((t) => (
          <DropdownItem key={t.id} active={t.id === tab} onClick={() => onTabChange(t.id)}>
            {t.label}
          </DropdownItem>
        ))}
      </DropdownMenu>

      <SaveButton state={saveState} dirty={dirty} />
    </nav>
  );
}
