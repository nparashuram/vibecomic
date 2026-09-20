import { parseProject } from '../ai/storageDeps';
import type { ComicProject } from '../types/comic';
import { loadProjectJson } from './driveClient';

/** Load, validate and normalize the project stored in a Drive folder. */
export async function loadProject(folderId: string): Promise<ComicProject> {
  return parseProject(await loadProjectJson(folderId));
}
