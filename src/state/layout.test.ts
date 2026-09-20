/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  absorbPanel,
  artPixels,
  cutAcross,
  defaultPointer,
  findDividers,
  moveEdge,
  normalizePagePanels,
  splitEvenly,
  splitRect,
} from './layout';
import type { Rect } from './layout';

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
const page = rect(0, 0, 100, 100);
const area = (rects: Rect[]) => rects.reduce((sum, r) => sum + r.width * r.height, 0);

// Left column A, right column split into B over C.
const columns = [rect(0, 0, 50, 100), rect(50, 0, 50, 50), rect(50, 50, 50, 50)];
// Two tiers, each split into two columns.
const grid = [rect(0, 0, 50, 50), rect(50, 0, 50, 50), rect(0, 50, 50, 50), rect(50, 50, 50, 50)];

test('splitRect cuts a rectangle at a percentage of its size', () => {
  assert.deepEqual(splitRect(page, 'horizontal', 30), [rect(0, 0, 100, 30), rect(0, 30, 100, 70)]);
  assert.deepEqual(splitRect(page, 'vertical', 25), [rect(0, 0, 25, 100), rect(25, 0, 75, 100)]);
});

test('splitRect refuses positions outside the rectangle and parts under 5%', () => {
  assert.throws(() => splitRect(page, 'vertical', 100), /position/);
  assert.throws(() => splitRect(page, 'vertical', 2), /too small/);
});

test('splitEvenly makes equal parts that tile the rectangle', () => {
  const rows = splitEvenly(page, 'horizontal', 3);
  assert.equal(rows.length, 3);
  assert.ok(Math.abs(area(rows) - 10000) < 1);
  assert.throws(() => splitEvenly(page, 'horizontal', 1), /at least 2/);
});

test('cutAcross cuts every panel a line crosses', () => {
  const cuts = cutAcross(grid, 'horizontal', 25);
  assert.deepEqual([...cuts.keys()], [0, 1]);
  assert.deepEqual(cuts.get(0), [rect(0, 0, 50, 25), rect(0, 25, 50, 25)]);
});

test('cutAcross leaves panels the line only touches at an edge', () => {
  const cuts = cutAcross(columns, 'horizontal', 50);
  assert.deepEqual([...cuts.keys()], [0]);
});

test('cutAcross throws when nothing is cut', () => {
  assert.throws(() => cutAcross(grid, 'horizontal', 50), /does not cut/);
  assert.throws(() => cutAcross(grid, 'vertical', 0), /greater than 0/);
});

test('findDividers finds each line once, with its full extent', () => {
  const dividers = findDividers(columns);
  assert.equal(dividers.length, 2);
  const vertical = dividers.find((d) => d.orientation === 'vertical')!;
  assert.deepEqual([vertical.coordinate, vertical.start, vertical.end], [50, 0, 100]);
});

test('moveEdge moves every panel on the same vertical line', () => {
  const moved = moveEdge(columns, 1, 'left', 30);
  assert.deepEqual(moved, [rect(0, 0, 30, 100), rect(30, 0, 70, 50), rect(30, 50, 70, 50)]);
});

test('moveEdge stops at the minimum panel size and never moves page edges', () => {
  assert.equal(moveEdge(columns, 0, 'right', 99)[1].width, 5);
  assert.equal(moveEdge(columns, 0, 'right', 0)[0].width, 5);
  assert.throws(() => moveEdge(columns, 0, 'left', 10), /outer edges/);
});

test('a horizontal divider spans the page but vertical dividers belong to their tier', () => {
  const horizontal = moveEdge(grid, 0, 'bottom', 40);
  assert.deepEqual(
    horizontal.map((r) => r.height),
    [40, 40, 60, 60]
  );
  const vertical = moveEdge(grid, 0, 'right', 30);
  assert.deepEqual(
    vertical.map((r) => [r.x, r.width]),
    [
      [0, 30],
      [30, 70],
      [0, 50],
      [50, 50],
    ]
  );
});

test('absorbPanel stretches the neighbours that exactly cover a side', () => {
  assert.deepEqual(absorbPanel(columns, 1), [rect(0, 0, 50, 100), rect(50, 0, 50, 100)]);
  assert.deepEqual(absorbPanel(columns, 0), [rect(0, 0, 100, 50), rect(0, 50, 100, 50)]);
});

test('absorbPanel gives up when no side is covered exactly', () => {
  // The right neighbour C runs past A's edge and D leaves a gap under it.
  const layout = [
    rect(0, 0, 50, 50),
    rect(50, 0, 50, 30),
    rect(50, 30, 50, 70),
    rect(0, 50, 40, 50),
  ];
  assert.equal(absorbPanel(layout, 0), null);
});

test('normalizePagePanels adds a panel to an empty page and stacks rect-less panels', () => {
  const empty: never[] = [];
  normalizePagePanels(empty);
  assert.equal((empty as unknown[]).length, 1);

  const legacy = [{ id: 'a' }, { id: 'b' }] as unknown as Parameters<typeof normalizePagePanels>[0];
  normalizePagePanels(legacy);
  assert.deepEqual(
    legacy.map((p) => [p.y, p.height]),
    [
      [0, 50],
      [50, 50],
    ]
  );
});

test('artPixels is 150 dpi, capped at 2048 on the long side', () => {
  assert.deepEqual(artPixels(6, 9), { width: 900, height: 1350 });
  assert.deepEqual(artPixels(40, 20), { width: 2048, height: 1024 });
});

test('defaultPointer aims below the bubble, inside the panel', () => {
  assert.deepEqual(defaultPointer({ x: 10, y: 10, width: 40, height: 20 }), {
    tailX: 30,
    tailY: 42,
  });
  assert.equal(defaultPointer({ x: 10, y: 90, width: 40, height: 20 }).tailY, 95);
});
