/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { driveFileIdFromUrl, driveFileUrl } from './driveUrl';

test('driveFileUrl builds the canonical download URL', () => {
  assert.equal(
    driveFileUrl('abc_123-X'),
    'https://www.googleapis.com/drive/v3/files/abc_123-X?alt=media'
  );
});

test('driveFileIdFromUrl reads the id from every Drive URL form', () => {
  const urls = [
    'https://www.googleapis.com/drive/v3/files/abc123?alt=media',
    'https://drive.google.com/file/d/abc123/view?usp=sharing',
    'https://drive.google.com/uc?export=view&id=abc123',
    'https://drive.google.com/open?id=abc123',
    'https://drive.usercontent.google.com/download?id=abc123&export=download',
  ];
  for (const url of urls) assert.equal(driveFileIdFromUrl(url), 'abc123', url);
});

test('driveFileIdFromUrl rejects anything that is not a Drive file URL', () => {
  for (const url of [
    '',
    'https://example.com/a.png',
    'data:image/png;base64,AAAA',
    'blob:http://x/1',
  ]) {
    assert.equal(driveFileIdFromUrl(url), null, url);
  }
});
