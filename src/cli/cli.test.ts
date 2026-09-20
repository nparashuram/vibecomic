/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { COMMAND_TABLE } from './commands.gen';
import { runCli } from './main';
import { createFakeGoogle } from './testing/fakeGoogle';

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/** A fresh machine (state folder, working folder) talking to a fresh fake Google. */
function setup() {
  const clock = { now: Date.parse('2026-09-20T12:00:00Z') };
  const google = createFakeGoogle(() => clock.now);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecomics-home-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecomics-work-'));

  async function run(...argv: string[]) {
    let out = '';
    let err = '';
    const code = await runCli(argv, {
      env: { VIBECOMICS_HOME: home },
      cwd: work,
      fetch: google.fetch,
      stdout: (text) => void (out += text),
      stderr: (text) => void (err += text),
      deviceClient: { clientId: 'client', clientSecret: 'secret' },
      sleep: async () => undefined,
      now: () => clock.now,
    });
    return { code, out, err, json: () => JSON.parse(out) };
  }

  async function login() {
    await run('auth', 'login');
    google.approve();
    const status = await run('auth', 'status');
    assert.equal(status.json().connected, true);
  }

  return { run, login, google, clock, home, work };
}

test('help lists the commands and explains one', async () => {
  const { run } = setup();
  const overview = await run();
  assert.equal(overview.code, 0);
  assert.match(overview.out, /layers add\s+Add a layer to a panel/);
  assert.doesNotMatch(overview.out, /^ {2}page openPreview/m);

  const layersAdd = await run('help', 'layers', 'add');
  assert.match(layersAdd.out, /^vibecomics layers add <panelId> <input>/);
  assert.match(layersAdd.out, /input {2}\(json, required\)/);

  const viaFlag = await run('media', 'upload', '--help');
  assert.match(viaFlag.out, /vibecomics media upload <dataUrl> \[--name <text>\]/);
  assert.match(viaFlag.out, /--thumbnail {2}\(file, optional\)/);
});

test('login is two steps and survives across separate runs', async () => {
  const { run, google, clock, home } = setup();

  const started = await run('auth', 'login');
  assert.equal(started.code, 0);
  assert.equal(started.json().pending.code, 'ABCD-EFGH');
  assert.equal(started.json().pending.url, 'https://www.google.com/device');
  assert.equal(started.json().connected, false);

  const waiting = await run('auth', 'status');
  assert.equal(waiting.json().connected, false);
  assert.equal(waiting.json().pending.code, 'ABCD-EFGH');

  google.approve();
  const done = await run('auth', 'status');
  assert.equal(done.json().connected, true);
  assert.equal(done.json().pending, undefined);

  // The refresh token is on disk, readable only by the user.
  const file = path.join(home, 'state.json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).auth.refreshToken, 'refresh-1');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  // An hour later the access token has expired: the next run refreshes it by itself.
  clock.now += 2 * 3600 * 1000;
  const listed = await run('storage', 'listProjects');
  assert.equal(listed.code, 0, listed.err);
  assert.ok(google.calls.some((c) => c === 'POST oauth2.googleapis.com/token'));

  const out = await run('auth', 'logout');
  assert.equal(out.json().connected, false);
  assert.equal((await run('storage', 'listProjects')).code, 1);
});

test('a denied login reports why and can be retried', async () => {
  const { run, google } = setup();
  await run('auth', 'login');
  google.deny();
  const status = await run('auth', 'status');
  assert.match(status.json().error, /denied/);
  assert.equal(status.json().pending, undefined);
});

test('without a login, Drive commands say how to log in', async () => {
  const { run } = setup();
  const result = await run('storage', 'listProjects');
  assert.equal(result.code, 1);
  assert.match(result.err, /Not connected to Google Drive\. Run "vibecomics auth login"/);
});

test('a project persists on Drive and is picked up by the next command', async () => {
  const { run, login, google } = setup();
  await login();

  const created = await run('storage', 'createProject', 'Demo');
  assert.equal(created.code, 0, created.err);
  const folder = created.json();
  assert.equal(folder.name, 'Demo');

  // Separate runs share the open project through the state file, and each saves before it exits.
  const page = await run('page', 'add', '--title', 'Chapter 1');
  assert.equal(page.json().title, 'Chapter 1');
  assert.equal((await run('page', 'count')).json(), 2);
  assert.equal(google.projectIn(folder.id).pages.length, 2);

  const split = await run('panels', 'splitEvenly', page.json().panels[0].id, 'vertical', '2');
  assert.equal(split.json().length, 2);

  const layer = await run(
    'layers',
    'add',
    split.json()[0].id,
    '{"kind":"background","prompt":"A rooftop at dusk","aspectRatio":1.5}'
  );
  assert.equal(layer.json().kind, 'background');
  const saved = google.projectIn(folder.id);
  assert.equal(saved.pages[1].panels[0].layers[0].prompt, 'A rooftop at dusk');

  // The current page is remembered: with none given, panels list shows page 1.
  assert.equal((await run('panels', 'list')).json().length, 2);
  assert.equal((await run('page', 'select', '0')).json().title, 'Cover');
  assert.equal((await run('panels', 'list')).json().length, 1);
});

test('--project opens another project first, and other projects are listed', async () => {
  const { run, login } = setup();
  await login();
  await run('storage', 'createProject', 'One');
  await run('storage', 'createProject', 'Two');
  await run('metadata', 'setOutline', 'Outline of two');

  const listed = await run('storage', 'listProjects');
  assert.deepEqual(
    listed.json().map((f: { name: string }) => f.name),
    ['One', 'Two']
  );
  const outline = await run('metadata', 'get', '--project', 'One');
  assert.equal(outline.json().outline, '');
  assert.equal((await run('metadata', 'get')).json().outline, '');
  assert.equal((await run('metadata', 'get', '--project', 'Two')).json().outline, 'Outline of two');
});

test('media: upload a file with a thumbnail, look at it, delete it', async () => {
  const { run, login, google, work } = setup();
  await login();
  await run('storage', 'createProject', 'Art');
  fs.writeFileSync(path.join(work, 'hero.png'), PNG);
  fs.writeFileSync(path.join(work, 'hero.small.png'), PNG);

  const uploaded = await run('media', 'upload', 'hero.png', '--thumbnail', 'hero.small.png');
  assert.equal(uploaded.code, 0, uploaded.err);
  const item = uploaded.json();
  assert.equal(item.name, 'hero.png');
  assert.equal(item.mimeType, 'image/png');
  assert.ok(item.thumbnailDriveFileId);
  assert.deepEqual(google.file(item.driveFileId)!.content, PNG);
  assert.equal((await run('media', 'list')).json().length, 1);

  const downloaded = await run('media', 'download', item.id, '--out', 'copy.png');
  assert.equal(downloaded.json().savedTo, path.join(work, 'copy.png'));
  assert.deepEqual(fs.readFileSync(path.join(work, 'copy.png')), PNG);

  assert.equal(uploaded.err, ''); // a thumbnail was given: nothing to remind about

  // Without a thumbnail the upload works, and stderr says how to add one (stdout stays pure JSON).
  const named = await run('media', 'upload', 'hero.png', '--name', 'hero-front.png');
  assert.equal(named.json().name, 'hero-front.png');
  assert.equal(named.json().thumbnailDriveFileId, undefined);
  assert.match(named.err, /note: this image has no thumbnail.*media uploadThumbnail/);

  const removed = await run('media', 'delete', item.id);
  assert.deepEqual(removed.json(), { layers: 0, entries: 0 });
  assert.equal(google.file(item.driveFileId)!.trashed, true);
});

test('JSON can come from a file with @', async () => {
  const { run, login, google, work } = setup();
  await login();
  const { id } = (await run('storage', 'createProject', 'Files')).json();
  fs.writeFileSync(path.join(work, 'outline.txt'), 'Premise: a cat. Twist: it is a dog.');
  await run('metadata', 'setOutline', '@outline.txt');
  assert.equal(google.projectIn(id).metadata.outline, 'Premise: a cat. Twist: it is a dog.');

  const panelId = (await run('page', 'current')).json().panels[0].id;
  fs.writeFileSync(path.join(work, 'bubble.json'), '{"text":"Hi!","kind":"speech"}');
  const bubble = await run('bubbles', 'add', panelId, '@bubble.json');
  assert.equal(bubble.json().text, 'Hi!');
});

test('mistakes are reported clearly and change nothing', async () => {
  const { run, login, google } = setup();
  await login();
  const { id } = (await run('storage', 'createProject', 'Oops')).json();
  const content = () => {
    const { pages, metadata } = google.projectIn(id);
    return JSON.stringify({ pages, metadata });
  };
  const before = content();

  const unknown = await run('nope', 'thing');
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /Unknown command "nope"/);

  const wrongFn = await run('layers', 'explode');
  assert.equal(wrongFn.code, 2);
  assert.match(wrongFn.err, /Commands in layers: list, get, add/);

  assert.match((await run('panels', 'get')).err, /Missing panelId/);
  assert.match(
    (await run('panels', 'split', 'p', 'sideways')).err,
    /axis must be one of: horizontal, vertical/
  );
  assert.match((await run('page', 'select', 'two')).err, /"two" is not a number/);
  assert.match((await run('layers', 'add', 'p', '{oops')).err, /not valid JSON/);
  assert.match((await run('page', 'count', '--wat')).err, /Unknown option --wat/);
  assert.match((await run('page', 'count', 'extra')).err, /Too many arguments/);
  assert.match(
    (await run('media', 'upload', 'missing.png')).err,
    /Cannot read the file "missing.png"/
  );

  const apiError = await run('layers', 'list', 'no-such-panel');
  assert.equal(apiError.code, 0); // the API returns null for an unknown panel
  assert.equal(apiError.json(), null);
  const thrown = await run('panels', 'delete', 'no-such-panel');
  assert.equal(thrown.json(), false);

  const preview = await run('page', 'openPreview');
  assert.equal(preview.code, 1);
  assert.match(preview.err, /no preview in the CLI/);

  assert.equal(content(), before);
});

test('storage connect explains that the CLI logs in another way', async () => {
  const { run } = setup();
  const result = await run('storage', 'connect');
  assert.equal(result.code, 1);
  assert.match(result.err, /auth login/);
});

test('every command has help that starts with its own usage line', async () => {
  const { run } = setup();
  assert.ok(COMMAND_TABLE.commands.length >= 60);
  for (const command of COMMAND_TABLE.commands) {
    const [namespace, name] = command.path.split('.');
    const help = await run('help', namespace, name);
    assert.equal(help.code, 0, `${command.path}: ${help.err}`);
    assert.ok(help.out.startsWith(`vibecomics ${namespace} ${name}`), command.path);
    const viaFlag = await run(namespace, name, '--help');
    assert.equal(viaFlag.out, help.out, command.path);
  }
  for (const ns of COMMAND_TABLE.namespaces) {
    assert.match((await run('help', ns.name)).out, new RegExp(`Commands in "${ns.name}"`));
  }
  assert.match((await run('help', '--full')).out, /How the CLI works[\s\S]*# ComicBuilder/);
  assert.match((await run('help', 'auth')).out, /auth login \[--wait\]/);
  assert.equal((await run('help', 'nope')).code, 2);
});

test('auth login --wait keeps checking until the user approves', async () => {
  const { run, google } = setup();
  let checks = 0;
  // Approve on the third check by patching the fake through the run's sleep: use a fresh runner.
  let out = '';
  const code = await runCli(['auth', 'login', '--wait'], {
    env: { VIBECOMICS_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'vibecomics-wait-')) },
    cwd: os.tmpdir(),
    fetch: google.fetch,
    stdout: (text) => void (out += text),
    stderr: () => undefined,
    deviceClient: { clientId: 'client', clientSecret: 'secret' },
    sleep: async () => {
      if (++checks === 3) google.approve();
    },
  });
  assert.equal(code, 0);
  assert.equal(checks, 3);
  assert.equal(JSON.parse(out).connected, true);
  void run;
});

test('an expired login code is reported and cleared', async () => {
  const { run, clock } = setup();
  await run('auth', 'login');
  clock.now += 31 * 60 * 1000;
  const status = await run('auth', 'status');
  assert.match(status.json().error, /expired/);
  assert.equal(status.json().pending, undefined);
  assert.equal((await run('auth', 'status')).json().error, undefined);
});

test('a revoked login says to log in again', async () => {
  const { run, login, google, clock } = setup();
  await login();
  google.revokeAll();
  clock.now += 2 * 3600 * 1000;
  const result = await run('storage', 'listProjects');
  assert.equal(result.code, 1);
  assert.match(result.err, /Could not refresh the Google login.*auth login/);

  // `auth status` reports it instead of failing, so an agent can tell it must log in again.
  const status = await run('auth', 'status');
  assert.equal(status.code, 0);
  assert.equal(status.json().connected, false);
  assert.match(status.json().error, /Could not refresh the Google login/);
  assert.match(status.json().next, /auth login/);
});

test('a broken state file is reported, not silently discarded', async () => {
  const { run, home } = setup();
  fs.writeFileSync(path.join(home, 'state.json'), '{not json');
  const result = await run('storage', 'status');
  assert.equal(result.code, 1);
  assert.match(result.err, /state\.json is not valid JSON/);
  assert.equal(fs.readFileSync(path.join(home, 'state.json'), 'utf8'), '{not json');
});

test('--project with an unknown name fails and keeps the current project', async () => {
  const { run, login } = setup();
  await login();
  await run('storage', 'createProject', 'Keep');
  const result = await run('metadata', 'get', '--project', 'Missing');
  assert.equal(result.code, 1);
  assert.match(result.err, /No project folder "Missing"/);
  assert.equal((await run('page', 'count')).json(), 1);
});

test('the rest of the API works through the command line', async () => {
  const { run, login, google, work } = setup();
  await login();
  const { id: folderId } = (await run('storage', 'createProject', 'Everything')).json();
  const saved = () => google.projectIn(folderId);

  // Story bible
  const hero = (
    await run('characters', 'create', '{"name":"Mira","description":"Red hair","linkIds":[]}')
  ).json();
  assert.equal(hero.name, 'Mira');
  await run('characters', 'update', hero.id, '{"description":"Short red hair"}');
  assert.equal((await run('characters', 'get', hero.id)).json().description, 'Short red hair');
  const scene = (await run('scenes', 'create', '{"name":"Roof"}')).json();
  const prop = (await run('objects', 'create', '{"name":"Satchel"}')).json();
  assert.equal((await run('scenes', 'list')).json()[0].id, scene.id);
  assert.equal((await run('objects', 'list')).json()[0].id, prop.id);
  assert.equal((await run('objects', 'delete', prop.id)).json(), true);
  assert.equal(saved().metadata.characters[0].description, 'Short red hair');

  // Page size, outline, page and panel edits (object flags)
  await run('metadata', 'setPageSize', '{"label":"Square","widthIn":8,"heightIn":8}');
  assert.equal(saved().metadata.pageSize.label, 'Square');
  await run('metadata', 'setOutline', '');
  const page = (await run('page', 'add')).json();
  assert.equal(page.title, '');
  const [top, bottom] = (
    await run('panels', 'split', page.panels[0].id, 'horizontal', '40')
  ).json();
  assert.equal(bottom.y, 40);
  assert.equal(
    (await run('panels', 'update', top.id, '--title', 'Establishing')).json().title,
    'Establishing'
  );
  assert.equal((await run('panels', 'resize', top.id, 'bottom', '45')).json().length, 2);
  assert.equal((await run('panels', 'size', top.id)).json().pixels.width > 0, true);
  assert.equal((await run('panels', 'splitAcross', 'vertical', '50')).json().length, 4);

  // Layers: numbers and words for "move"
  const a = (await run('layers', 'add', top.id, '{"prompt":"one"}')).json();
  const b = (await run('layers', 'add', top.id, '{"prompt":"two"}')).json();
  assert.deepEqual(
    (await run('layers', 'move', top.id, a.id, 'top')).json().map((l: { id: string }) => l.id),
    [b.id, a.id]
  );
  assert.deepEqual(
    (await run('layers', 'move', top.id, a.id, '0')).json().map((l: { id: string }) => l.id),
    [a.id, b.id]
  );
  assert.equal(
    (await run('layers', 'update', top.id, a.id, '{"opacity":0.5}')).json().opacity,
    0.5
  );
  assert.equal((await run('layers', 'size', top.id, a.id)).json().pixels.width > 0, true);
  assert.equal((await run('layers', 'delete', top.id, b.id)).json(), true);

  // Bubbles
  const bubble = (await run('bubbles', 'add', top.id, '{"text":"Hi","kind":"thought"}')).json();
  assert.equal(
    (await run('bubbles', 'update', top.id, bubble.id, '{"text":"Hello"}')).json().text,
    'Hello'
  );
  assert.equal((await run('bubbles', 'get', top.id, bubble.id)).json().text, 'Hello');
  assert.equal((await run('bubbles', 'delete', top.id, bubble.id)).json(), true);

  // A thumbnail added later, then the whole project replaced from a file
  fs.writeFileSync(path.join(work, 'art.png'), PNG);
  const media = (await run('media', 'upload', 'art.png')).json();
  assert.equal(media.thumbnailDriveFileId, undefined);
  const fixed = (await run('media', 'uploadThumbnail', media.id, 'art.png')).json();
  assert.ok(fixed.thumbnailDriveFileId);
  assert.equal((await run('media', 'get', media.id)).json().id, media.id);

  const snapshot = JSON.parse(JSON.stringify(saved()));
  snapshot.title = 'Loaded from a file';
  fs.writeFileSync(path.join(work, 'project.json'), JSON.stringify(snapshot));
  assert.equal((await run('project', 'load', '@project.json')).json().ok, true);
  assert.equal(saved().title, 'Loaded from a file');
  assert.equal((await run('page', 'current')).json().number, 0);

  // Save, close, disconnect
  assert.equal((await run('storage', 'save')).json().ok, true);
  assert.equal((await run('storage', 'closeProject')).code, 0);
  assert.equal((await run('page', 'count')).json(), 0);
  assert.equal((await run('page', 'add')).code, 1);
  assert.equal((await run('storage', 'status')).json().connected, true);
  await run('storage', 'disconnect');
  assert.equal((await run('storage', 'status')).json().connected, false);
});
