import { assertValidProject, normalizeProject } from '../state/project';
import type { ComicProject } from '../types/comic';
import { loadProjectJson } from './driveClient';

/** Load, validate and normalize the project stored in a Drive folder. */
export async function loadProject(folderId: string): Promise<ComicProject> {
  const raw = await loadProjectJson(folderId);
  assertValidProject(raw);
  normalizeProject(raw);
  return raw;
}
