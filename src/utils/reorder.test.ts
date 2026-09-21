/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moved, slotAt } from './reorder';

const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const ids = (items: Array<{ id: string }>) => items.map((item) => item.id).join('');

test('moved puts an item at a position and keeps the others in order', () => {
  assert.equal(ids(moved(list, 'a', 2)), 'bcad');
  assert.equal(ids(moved(list, 'd', 0)), 'dabc');
  assert.equal(ids(moved(list, 'b', 1)), 'abcd');
  assert.equal(ids(list), 'abcd'); // the input is not changed
});

test('moved leaves the list alone for an unknown id', () => {
  assert.equal(moved(list, 'zzz', 1), list);
});

test('slotAt counts the other items the pointer has passed', () => {
  const mids = [10, 30, 50];
  assert.equal(slotAt(mids, 0), 0);
  assert.equal(slotAt(mids, 31), 2);
  assert.equal(slotAt(mids, 500), 3);
  assert.equal(slotAt([], 5), 0);
});
