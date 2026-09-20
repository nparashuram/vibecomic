import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { getAccessToken, saveProjectJson } from '../drive/driveClient';
import type { ComicProject } from '../types/comic';
import { errorMessage } from '../utils/errors';

const AUTOSAVE_INTERVAL_MS = 60_000;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Options {
  /** True while a project is open. */
  active: boolean;
  projectRef: MutableRefObject<ComicProject | null>;
  folderIdRef: MutableRefObject<string | null>;
  setProject: (project: ComicProject) => void;
  onError: (message: string) => void;
}

/**
 * Tracks unsaved changes and writes project.json to Drive: every minute while a
 * project is open, but only when something changed, plus on demand via save().
 */
export function useProjectSaver({ active, projectRef, folderIdRef, setProject, onError }: Options) {
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const dirtyRef = useRef(false);
  const changeCountRef = useRef(0);
  const inFlightRef = useRef<Promise<unknown> | null>(null);

  function markDirty() {
    changeCountRef.current++;
    dirtyRef.current = true;
    setDirty(true);
  }

  /** Forget unsaved changes and the last save result (a project was opened or closed). */
  function reset() {
    dirtyRef.current = false;
    setDirty(false);
    setSaveState('idle');
  }

  /** Save if there are unsaved changes. Resolves true when nothing is left unsaved. */
  async function save(): Promise<boolean> {
    while (inFlightRef.current) await inFlightRef.current.catch(() => undefined);

    const project = projectRef.current;
    const folderId = folderIdRef.current;
    if (!project || !folderId) return false;
    if (!dirtyRef.current) return true;
    if (!getAccessToken()) {
      onError('Could not save: not connected to Google Drive.');
      return false;
    }

    const changeCount = changeCountRef.current;
    const savedAt = new Date().toISOString();
    const write = saveProjectJson(folderId, { ...project, savedAt, updatedAt: savedAt });
    inFlightRef.current = write;
    setSaveState('saving');
    try {
      await write;
      if (folderIdRef.current === folderId && projectRef.current) {
        const current = { ...projectRef.current, savedAt };
        projectRef.current = current;
        setProject(current);
        // Edits made while the write was in flight stay unsaved for the next round.
        if (changeCountRef.current === changeCount) {
          dirtyRef.current = false;
          setDirty(false);
        }
        setSaveState('saved');
      }
      return true;
    } catch (e) {
      setSaveState('error');
      onError(`Save failed: ${errorMessage(e)}`);
      return false;
    } finally {
      inFlightRef.current = null;
    }
  }

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (dirtyRef.current) void saveRef.current();
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return { dirty, saveState, save, markDirty, reset };
}
