import { parseProject } from '../ai/storageDeps';
import type { ComicProject } from '../types/comic';
import { loadProjectFile } from './driveClient';

/** Load, validate and normalize the project stored in a Drive folder, with its Drive version. */
export async function loadProject(
  folderId: string
): Promise<{ project: ComicProject; version: string | null }> {
  const file = await loadProjectFile(folderId);
  return { project: parseProject(file.json), version: file.version };
}
