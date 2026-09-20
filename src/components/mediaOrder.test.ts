/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MediaItem } from '../types/comic';
import type { MediaInfo } from './mediaImages';
import { groupMedia, pageOfGroups, pageOfItem } from './mediaOrder';

const item = (id: string): MediaItem => ({
  id,
  name: id,
  driveFileId: id,
  url: '',
  mimeType: 'image/png',
});

const ids = (groups: Array<{ items: MediaItem[] }>) =>
  groups.map((group) => group.items.map((i) => i.id));

test('backgrounds: opaque images that fit the panel come first, transparent ones last', () => {
  const media = ['cutout', 'wide', 'tall', 'unknown'].map(item);
  const infos = new Map<string, MediaInfo | undefined>([
    ['cutout', { aspect: 1.5, transparent: true }],
    ['wide', { aspect: 1.5, transparent: false }],
    ['tall', { aspect: 0.7, transparent: false }],
    ['unknown', undefined],
  ]);
  const groups = groupMedia(media, infos, { kind: 'background', aspectRatio: 1.52 });
  assert.deepEqual(
    groups.map((g) => g.title),
    ['Fits this panel', 'Other backgrounds', 'Other images']
  );
  assert.deepEqual(ids(groups), [['wide'], ['tall'], ['cutout', 'unknown']]);
});

test('layers: transparent images first', () => {
  const media = ['photo', 'cutout'].map(item);
  const infos = new Map<string, MediaInfo | undefined>([
    ['photo', { aspect: 1, transparent: false }],
    ['cutout', { aspect: 1, transparent: true }],
  ]);
  assert.deepEqual(ids(groupMedia(media, infos, { kind: 'layer' })), [['cutout'], ['photo']]);
});

test('pageOfGroups cuts across groups and repeats the title of a split group', () => {
  const groups = [
    { title: 'A', items: ['a1', 'a2', 'a3'].map(item) },
    { title: 'B', items: ['b1', 'b2', 'b3', 'b4'].map(item) },
  ];
  const first = pageOfGroups(groups, 0, 4);
  assert.equal(first.pages, 2);
  assert.deepEqual(ids(first.groups), [['a1', 'a2', 'a3'], ['b1']]);
  const second = pageOfGroups(groups, 1, 4);
  assert.deepEqual(
    second.groups.map((g) => g.title),
    ['B']
  );
  assert.deepEqual(ids(second.groups), [['b2', 'b3', 'b4']]);
});

test('pageOfGroups clamps the page, and an empty list has one empty page', () => {
  const groups = [{ title: 'A', items: ['a1', 'a2', 'a3'].map(item) }];
  assert.equal(pageOfGroups(groups, 9, 2).page, 1);
  assert.equal(pageOfGroups(groups, -3, 2).page, 0);
  assert.deepEqual(pageOfGroups([], 0), { groups: [], page: 0, pages: 1 });
});

test('pageOfItem finds the page holding an item', () => {
  const groups = [{ title: 'A', items: ['a1', 'a2', 'a3', 'a4', 'a5'].map(item) }];
  assert.equal(pageOfItem(groups, 'a5', 2), 2);
  assert.equal(pageOfItem(groups, 'a1', 2), 0);
  assert.equal(pageOfItem(groups, 'missing', 2), 0);
  assert.equal(pageOfItem(groups, undefined, 2), 0);
});
