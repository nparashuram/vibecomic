/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ComicProject, MediaItem } from '../types/comic';
import { removeMedia } from './media';
import { assertValidProject, createBlankProject } from './project';

const item = (id: string, driveFileId: string): MediaItem => ({
  id,
  name: `${id}.png`,
  driveFileId,
  url: `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
  mimeType: 'image/png',
  thumbnailDriveFileId: `${driveFileId}-thumb`,
});

function projectWithMedia(): ComicProject {
  const project = createBlankProject('Test');
  project.metadata.media = [item('m1', 'F1'), item('m2', 'F2')];
  project.metadata.characters.push({
    id: 'c1',
    name: 'Hero',
    description: '',
    imageIds: ['m1', 'm2'],
    sceneIds: [],
  });
  const layer = (id: string, mediaId: string | undefined, src: string) => ({
    id,
    name: id,
    kind: 'foreground' as const,
    src,
    ...(mediaId && { mediaId }),
    visible: true,
    x: 0,
    y: 0,
    width: 100,
    rotation: 0,
    opacity: 1,
  });
  project.pages[0].panels[0].layers = [
    layer('with-id', 'm1', project.metadata.media[0].url),
    layer('by-url-only', undefined, project.metadata.media[0].url),
    layer('other', 'm2', project.metadata.media[1].url),
  ];
  return project;
}

test('removeMedia unregisters the image and lets go of everything using it', () => {
  const project = projectWithMedia();
  assert.deepEqual(removeMedia(project, 'm1'), { layers: 2, entries: 1 });

  assert.deepEqual(
    project.metadata.media.map((m) => m.id),
    ['m2']
  );
  assert.deepEqual(project.metadata.characters[0].imageIds, ['m2']);
  const [withId, byUrl, other] = project.pages[0].panels[0].layers;
  assert.equal(withId.src, '');
  assert.equal('mediaId' in withId, false);
  assert.equal(byUrl.src, '');
  assert.equal(other.mediaId, 'm2');
  assert.notEqual(other.src, '');
  assertValidProject(project);
});

test('removeMedia rejects an unknown id and changes nothing', () => {
  const project = projectWithMedia();
  assert.throws(() => removeMedia(project, 'nope'), /not found/);
  assert.equal(project.metadata.media.length, 2);
});
