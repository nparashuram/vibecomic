import { useCallback, useEffect, useRef, useState } from 'react';
import { installComicBuilder, uninstallComicBuilder } from './ai/actions';
import type { ActionResult, ComicBuilderDeps } from './ai/deps';
import { createMediaDeps, createOrOpenProject } from './ai/storageDeps';
import EditorScreen from './components/EditorScreen';
import { initialTab } from './components/editorTabs';
import type { EditorTab } from './components/editorTabs';
import PreviewScreen from './components/PreviewScreen';
import ProjectTiles from './components/ProjectTiles';
import SplashScreen from './components/SplashScreen';
import StatusToast from './components/StatusToast';
import type { Status } from './components/StatusToast';
import { getGoogleClientId } from './config';
import {
  awaitDeviceAccess,
  downloadFile,
  disconnectDrive,
  ensureProjectFolder,
  hasDriveAccess,
  listProjectFolders,
  loadProjectJson,
  requestDeviceAccess,
  requestDriveAccess,
  saveProjectJson,
  trashFile,
  uploadImage,
} from './drive/driveClient';
import type { DeviceCodeInfo, ProjectFolder } from './drive/driveClient';
import { loadProject } from './drive/projectStore';
import { useProjectSaver } from './state/useProjectSaver';
import type { ComicProject } from './types/comic';
import { errorMessage } from './utils/errors';
import { makeThumbnail } from './utils/thumbnail';

type Screen = 'splash' | 'tiles' | 'editor';

/** The Drive calls the ComicBuilder deps make: the page's own token and fetch. */
const drive = {
  uploadImage,
  trashFile,
  downloadFile,
  ensureProjectFolder,
  loadProjectJson,
  saveProjectJson,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [preview, setPreview] = useState(false);
  const [project, setProject] = useState<ComicProject | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [status, setStatusState] = useState<Status | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [tab, setTab] = useState<EditorTab>('pages');

  // Refs mirror state so the ComicBuilder deps, installed once, always see the latest values.
  const projectRef = useRef<ComicProject | null>(null);
  const pageIndexRef = useRef(0);
  const folderIdRef = useRef<string | null>(null);

  const clearStatus = useCallback(() => setStatusState(null), []);
  const setStatus = (text: string, error = false) => setStatusState({ text, error });

  const saver = useProjectSaver({
    active: project !== null,
    projectRef,
    folderIdRef,
    setProject,
    onError: (message) => setStatus(message, true),
  });

  function setCurrentProject(next: ComicProject | null) {
    projectRef.current = next;
    setProject(next);
  }

  function selectPage(index: number) {
    pageIndexRef.current = index;
    setPageIndex(index);
  }

  function showProject(opened: ComicProject, folderId: string) {
    folderIdRef.current = folderId;
    setCurrentProject(opened);
    selectPage(0);
    setPreview(false);
    setTab(initialTab(opened));
    saver.reset();
    setScreen('editor');
  }

  function dropProject() {
    folderIdRef.current = null;
    setCurrentProject(null);
    selectPage(0);
    setPreview(false);
    setTab('pages');
    saver.reset();
  }

  async function refreshTiles(): Promise<ProjectFolder[]> {
    try {
      const list = await listProjectFolders();
      setFolders(list);
      return list;
    } catch (e) {
      setStatus(`Could not list Drive folders: ${errorMessage(e)}`, true);
      return [];
    }
  }

  async function showTiles(): Promise<ProjectFolder[]> {
    const list = await refreshTiles();
    setScreen('tiles');
    return list;
  }

  async function openFolder(folder: ProjectFolder): Promise<ActionResult> {
    setStatus('Loading project…');
    try {
      const opened = await loadProject(folder.id);
      showProject(opened, folder.id);
      setStatus(`Opened "${opened.title}".`);
      return { ok: true };
    } catch (e) {
      const error = `Could not open "${folder.name}": ${errorMessage(e)}`;
      setStatus(error, true);
      return { ok: false, error };
    }
  }

  // The ComicBuilder API is installed once; every helper it uses goes through refs and setState.
  useEffect(() => {
    const deps: ComicBuilderDeps = {
      getProject: () => projectRef.current,

      updateProject: (mutation) => {
        const current = projectRef.current;
        if (!current) throw new Error('No project is open.');
        const next = structuredClone(current);
        mutation(next);
        next.updatedAt = new Date().toISOString();
        setCurrentProject(next);
        saver.markDirty();
      },

      replaceProject: (replacement) => {
        setCurrentProject(replacement);
        selectPage(0);
        setPreview(false);
        saver.markDirty();
      },

      getPageIndex: () => pageIndexRef.current,
      setPageIndex: selectPage,
      setPreview,
      setStatus: (message) => setStatus(message),

      connectStorage: async () => {
        try {
          await requestDriveAccess();
          await showTiles();
          setStatusState(null);
        } catch (e) {
          setStatus(`Could not connect: ${errorMessage(e)}`, true);
        }
      },

      connectStorageWithDevice: async () => {
        let info: DeviceCodeInfo;
        try {
          info = await requestDeviceAccess();
        } catch (e) {
          setStatus(`Could not connect: ${errorMessage(e)}`, true);
          throw e;
        }
        setDeviceCode(info);
        awaitDeviceAccess()
          .then(showTiles)
          .then(() => setStatusState(null))
          .catch((e) => setStatus(`Could not connect: ${errorMessage(e)}`, true))
          .finally(() => setDeviceCode(null));
        return info;
      },

      disconnectStorage: async () => {
        setDeviceCode(null);
        await saver.save();
        await disconnectDrive();
        dropProject();
        setFolders([]);
        setScreen('splash');
        setStatus('Disconnected from Google Drive.');
      },

      getStorageStatus: () => ({
        connected: hasDriveAccess(),
        configured: getGoogleClientId() !== null,
      }),

      listStorageProjects: listProjectFolders,

      createStorageProject: async (name, pageSize) => {
        const {
          folder,
          project: created,
          existed,
          title,
        } = await createOrOpenProject(drive, name, pageSize);
        showProject(created, folder.id);
        setStatus(`${existed ? 'Opened' : 'Created'} "${title}".`);
        return folder;
      },

      openStorageProject: openFolder,

      closeStorageProject: async () => {
        if (!(await saver.save())) return;
        dropProject();
        setScreen('tiles');
        setStatus('Project closed.');
        void refreshTiles();
      },

      showProjectTiles: showTiles,

      flushStorageSave: async () => {
        if (!projectRef.current) return { ok: false, error: 'No project is open.' };
        return (await saver.save())
          ? { ok: true }
          : { ok: false, error: 'Save failed. Check that Drive is still connected.' };
      },

      ...createMediaDeps({
        getProject: () => projectRef.current,
        getFolderId: () => folderIdRef.current,
        updateProject: (mutation) => deps.updateProject(mutation),
        drive,
        makeThumbnail,
      }),
    };

    installComicBuilder(deps);
    return uninstallComicBuilder;
    // Installed once: the deps only use refs and state setters, so they never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPage = project?.pages[pageIndex];
  let content = null;
  if (screen === 'splash') {
    content = <SplashScreen deviceCode={deviceCode} />;
  } else if (screen === 'tiles') {
    content = <ProjectTiles folders={folders} />;
  } else if (project && preview && currentPage) {
    content = <PreviewScreen page={currentPage} pageSize={project.metadata.pageSize} />;
  } else if (project) {
    content = (
      <EditorScreen
        project={project}
        pageIndex={pageIndex}
        tab={tab}
        onTabChange={setTab}
        saveState={saver.saveState}
        dirty={saver.dirty}
      />
    );
  }

  return (
    <>
      {content}
      <StatusToast status={status} onClose={clearStatus} />
    </>
  );
}
