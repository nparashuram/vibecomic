import { useCallback, useEffect, useRef, useState } from 'react';
import { installComicBuilder, uninstallComicBuilder } from './ai/actions';
import type { ActionResult, ComicBuilderDeps } from './ai/deps';
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
  ProjectFileMissingError,
  requestDeviceAccess,
  requestDriveAccess,
  saveProjectJson,
  trashFile,
  uploadImage,
} from './drive/driveClient';
import type { DeviceCodeInfo, ProjectFolder } from './drive/driveClient';
import { loadProject } from './drive/projectStore';
import { removeMedia } from './state/media';
import type { MediaRemoval } from './state/media';
import { createBlankProject } from './state/project';
import { useProjectSaver } from './state/useProjectSaver';
import type { ComicProject, MediaItem } from './types/comic';
import { DEFAULT_PAGE_SIZE } from './types/comic';
import { errorMessage } from './utils/errors';
import { dataUrlToFile, readFileAsDataUrl } from './utils/files';
import { driveFileUrl } from './utils/driveUrl';
import { newId } from './utils/id';
import { makeThumbnail, thumbnailName } from './utils/thumbnail';

type Screen = 'splash' | 'tiles' | 'editor';

/** Put a thumbnail of `item` in the project folder; returns its Drive file id. */
async function storeThumbnail(folderId: string, item: MediaItem, thumbnail: File): Promise<string> {
  const name = thumbnailName(item.name, thumbnail.type);
  return (await uploadImage(folderId, thumbnail, name)).id;
}

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
        const title = name.trim();
        if (!title) throw new Error('Project name is required.');
        const folder = await ensureProjectFolder(title);

        let existing: ComicProject | null = null;
        try {
          existing = await loadProject(folder.id);
        } catch (e) {
          // Only a folder without a project.json gets a fresh one; never overwrite on other errors.
          if (!(e instanceof ProjectFileMissingError)) throw e;
        }
        const created = existing ?? createBlankProject(title, pageSize ?? DEFAULT_PAGE_SIZE);
        if (!existing) await saveProjectJson(folder.id, created);

        showProject(created, folder.id);
        setStatus(`${existing ? 'Opened' : 'Created'} "${title}".`);
        return { id: folder.id, name: folder.name };
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

      downloadStorageMedia: async (id) => {
        const item = projectRef.current?.metadata.media.find((m) => m.id === id);
        if (!item) throw new Error(`Media "${id}" not found.`);
        const dataUrl = await readFileAsDataUrl(await downloadFile(item.driveFileId));
        return { name: item.name, mimeType: item.mimeType, dataUrl };
      },

      uploadStorageMedia: async (name, dataUrl, mimeType, thumbnailDataUrl) => {
        const folderId = folderIdRef.current;
        if (!folderId) throw new Error('No project folder is open.');
        const file = dataUrlToFile(dataUrl, name, mimeType);
        const given = thumbnailDataUrl
          ? dataUrlToFile(thumbnailDataUrl, name, 'image/png')
          : undefined;
        const uploaded = await uploadImage(folderId, file, name);
        const item: MediaItem = {
          id: newId('media'),
          name: uploaded.name,
          driveFileId: uploaded.id,
          url: driveFileUrl(uploaded.id),
          mimeType: uploaded.mimeType || mimeType,
        };
        try {
          const thumbnail = given ?? (await makeThumbnail(file, name));
          if (thumbnail)
            item.thumbnailDriveFileId = await storeThumbnail(folderId, item, thumbnail);
        } catch {
          // The image is safe; without a thumbnail the UI shows the full file (media.uploadThumbnail can add one).
        }
        deps.updateProject((p) => {
          p.metadata.media.push(item);
        });
        return structuredClone(item);
      },

      uploadStorageThumbnail: async (id, dataUrl) => {
        const folderId = folderIdRef.current;
        if (!folderId) throw new Error('No project folder is open.');
        const item = projectRef.current?.metadata.media.find((m) => m.id === id);
        if (!item) throw new Error(`Media "${id}" not found.`);
        const thumbnail = dataUrlToFile(dataUrl, item.name, 'image/png');
        const previous = item.thumbnailDriveFileId;
        const thumbnailDriveFileId = await storeThumbnail(folderId, item, thumbnail);
        deps.updateProject((p) => {
          const target = p.metadata.media.find((m) => m.id === id);
          if (target) target.thumbnailDriveFileId = thumbnailDriveFileId;
        });
        if (previous) await trashFile(previous).catch(() => undefined);
        return structuredClone({ ...item, thumbnailDriveFileId });
      },

      deleteStorageMedia: async (id) => {
        const item = projectRef.current?.metadata.media.find((m) => m.id === id);
        if (!item) throw new Error(`Media "${id}" not found.`);
        // Trash first: if Drive refuses, the project is left as it was.
        await trashFile(item.driveFileId);
        if (item.thumbnailDriveFileId) {
          await trashFile(item.thumbnailDriveFileId).catch(() => undefined);
        }
        let removal: MediaRemoval = { layers: 0, entries: 0 };
        deps.updateProject((p) => {
          removal = removeMedia(p, id);
        });
        return removal;
      },
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
