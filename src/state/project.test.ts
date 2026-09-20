/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ComicProject } from '../types/comic';
import { assertValidProject, createBlankProject, normalizeProject } from './project';

const DRIVE_URL = 'https://www.googleapis.com/drive/v3/files/IMG?alt=media';

const layer = (overrides: Record<string, unknown> = {}) => ({
  id: 'l1',
  name: 'Layer',
  kind: 'foreground',
  src: DRIVE_URL,
  visible: true,
  x: 0,
  y: 0,
  width: 100,
  rotation: 0,
  opacity: 1,
  ...overrides,
});

/** A project whose only panel holds the given layers and bubbles. */
function projectWith(layers: unknown[], bubbles: unknown[] = []) {
  const project = createBlankProject('Test') as unknown as {
    pages: Array<{ panels: Array<{ layers: unknown[]; bubbles: unknown[] }> }>;
  };
  project.pages[0].panels[0].layers = layers;
  project.pages[0].panels[0].bubbles = bubbles;
  return project as unknown as ComicProject;
}

test('a blank project is valid and starts with one full-page panel', () => {
  const project = createBlankProject('Test');
  assertValidProject(project);
  assert.equal(project.pages[0].panels.length, 1);
  assert.equal(project.pages[0].panels[0].width, 100);
});

test('layers may have a Drive image or none, but no other image source', () => {
  assertValidProject(projectWith([layer()]));
  assertValidProject(projectWith([layer({ src: '' })]));
  assert.throws(
    () => assertValidProject(projectWith([layer({ src: 'https://example.com/a.png' })])),
    /Google Drive URL/
  );
  assert.throws(
    () => assertValidProject(projectWith([layer({ src: 'blob:http://x/1' })])),
    /Google Drive URL/
  );
});

test('validation reports the path of the problem', () => {
  const project = projectWith([layer({ opacity: 3 })]);
  assert.throws(() => assertValidProject(project), /pages\[0\]\.panels\[0\]\.layers\[0\].*opacity/);
});

test('a panel rectangle is all-or-nothing and must lie within the page', () => {
  const partial = createBlankProject('Test') as unknown as {
    pages: Array<{ panels: Array<Record<string, unknown>> }>;
  };
  delete partial.pages[0].panels[0].height;
  assert.throws(() => assertValidProject(partial), /all of/);

  const outside = createBlankProject('Test');
  outside.pages[0].panels[0].width = 150;
  assert.throws(() => assertValidProject(outside), /within the page/);
});

test('normalizeProject upgrades older projects', () => {
  const old = projectWith(
    [layer({ src: '', driveFileId: 'IMG' })],
    [{ id: 'b', kind: 'speech', text: 'Hi', x: 1, y: 1, width: 40 }]
  );
  old.pages.push({ id: 'p2', number: 1, title: '', panels: [] });
  (old.metadata as { pageSize?: unknown }).pageSize = undefined;

  assertValidProject(old);
  normalizeProject(old);

  const [migrated] = old.pages[0].panels[0].layers;
  assert.equal(migrated.src, DRIVE_URL);
  assert.equal('driveFileId' in migrated, false);
  assert.equal(old.pages[0].panels[0].bubbles[0].height, 20);
  assert.equal(old.pages[1].panels.length, 1);
  assert.ok(old.metadata.pageSize.widthIn > 0);
});

test('normalizeProject turns a Drive share link into the canonical URL', () => {
  const project = projectWith([layer({ src: 'https://drive.google.com/file/d/IMG/view' })]);
  normalizeProject(project);
  assert.equal(project.pages[0].panels[0].layers[0].src, DRIVE_URL);
});

test('a media item may carry a thumbnail Drive file id, which must be a string', () => {
  const project = createBlankProject('Test');
  project.metadata.media.push({
    id: 'm1',
    name: 'a.png',
    driveFileId: 'F1',
    url: DRIVE_URL,
    mimeType: 'image/png',
    thumbnailDriveFileId: 'T1',
  });
  assertValidProject(project);
  (project.metadata.media[0] as unknown as Record<string, unknown>).thumbnailDriveFileId = 5;
  assert.throws(() => assertValidProject(project), /thumbnailDriveFileId/);
});
