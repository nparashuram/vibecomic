import type { ComicProject } from '../types/comic';

export type EditorTab = 'outline' | 'characters' | 'scenes' | 'pages';

export const EDITOR_TABS: Array<{ id: EditorTab; label: string }> = [
  { id: 'outline', label: 'Outline' },
  { id: 'characters', label: 'Characters' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'pages', label: 'Pages' },
];

/** A project with only its cover is new: start on the outline. Otherwise it is in progress. */
export const initialTab = (project: ComicProject): EditorTab =>
  project.pages.length > 1 ? 'pages' : 'outline';
