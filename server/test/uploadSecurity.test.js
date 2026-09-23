'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { setup, teardown, request, registerMember, createTrainer, adminContext, login } = require('./helpers');
const { AVATAR_MAX_BYTES, PHOTO_MAX_BYTES } = require('../utils/uploads');

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const GARBAGE = Buffer.from('this buffer has no image magic bytes whatsoever');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
const PDF = Buffer.from('%PDF-1.4 fake pdf bytes for the type rejection check');

const AVATARS_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const PHOTOS_DIR = path.join(__dirname, '..', 'uploads', 'photos');
const SECURE_URL_RE = /^\/uploads\/(avatars|photos)\/[a-f0-9]{48}\.(jpg|png|webp|gif)$/;

const dirCount = (dir) => {
  try {
    return fs.readdirSync(dir).length;
  } catch {
    return 0;
  }
};

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

const multipart = (fieldName, blob, name, extra = []) => {
  const form = new FormData();
  form.append(fieldName, blob, name);
  for (const [key, value] of extra) form.append(key, value);
  return form;
};

const postAvatar = async ({ token, blob = PNG_1x1, name = 'avatar.png', type = 'image/png', extra = [] } = {}) => {
  const res = await fetch(`${baseUrl}/api/auth/me/avatar`, {
    method: 'POST',
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    body: multipart('photo', new Blob([blob], { type }), name, extra),
  });
  return res;
};

const postPhoto = async ({ token, blob = PNG_1x1, name = 'progress.png', type = 'image/png', extra = [] } = {}) => {
  const res = await fetch(`${baseUrl}/api/photos`, {
    method: 'POST',
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    body: multipart('photo', new Blob([blob], { type }), name, extra),
  });
  return res;
};

// --- AVATAR -----------------------------------------------------------------

test('avatar: valid PNG upload is accepted with a secure random filename', async () => {
  const member = await registerMember();
  const res = await postAvatar({ token: member.token });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.user.avatar, SECURE_URL_RE);
  assert.ok(body.user.avatar.includes('/avatars/'));
  assert.ok(!body.user.avatar.includes(String(member.user.id)), 'avatar path must not contain the user ObjectId');
  assert.ok(!/-/.test(body.user.avatar), 'avatar path must not contain the legacy id-timestamp pattern');

  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.avatar, body.user.avatar);

  await request('DELETE', '/api/auth/me/avatar', { token: member.token });
});

test('avatar: a valid JPEG upload is accepted and stored as .jpg', async () => {
  const member = await registerMember();
  const res = await postAvatar({ token: member.token, blob: JPEG, name: 'face.jpeg', type: 'image/jpeg' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.user.avatar, /^\/uploads\/avatars\/[a-f0-9]{48}\.jpg$/);
  const file = path.join(AVATARS_DIR, path.basename(body.user.avatar));
  assert.equal(fs.existsSync(file), true);
  await request('DELETE', '/api/auth/me/avatar', { token: member.token });
  assert.equal(fs.existsSync(file), false, 'delete must remove the stored file');
});

test('avatar: oversized image is rejected (413) before anything is stored', async () => {
  const member = await registerMember();
  const before = dirCount(AVATARS_DIR);
  const huge = Buffer.concat([PNG_1x1, Buffer.alloc(AVATAR_MAX_BYTES + 1024)]);
  const res = await postAvatar({ token: member.token, blob: huge });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.match(body.message, /too large/i);
  assert.equal(dirCount(AVATARS_DIR), before, 'no file may be written for an oversized upload');
  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.user.avatar, '', 'avatar must stay untouched');
});

test('avatar: unsupported file types are rejected', async () => {
  const member = await registerMember();
  const before = dirCount(AVATARS_DIR);
  for (const [blob, type, name] of [
    [Buffer.from('plain text, definitely not an image'), 'text/plain', 'note.txt'],
    [EXE, 'application/x-msdownload', 'payload.exe'],
    [PDF, 'application/pdf', 'doc.pdf'],
  ]) {
    const res = await postAvatar({ token: member.token, blob, name, type });
    assert.equal(res.status, 400, `expected 400 for ${name}`);
  }
  assert.equal(dirCount(AVATARS_DIR), before, 'rejected types must not leave files behind');
  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.user.avatar, '');
});

test('avatar: malformed/spoofed image is rejected even when the MIME type claims an image', async () => {
  const member = await registerMember();
  const before = dirCount(AVATARS_DIR);
  const res = await postAvatar({ token: member.token, blob: GARBAGE, type: 'image/png' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /invalid image/i);
  assert.equal(dirCount(AVATARS_DIR), before, 'sniffed-invalid bytes must not be written to disk');
  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.user.avatar, '');
});

test('avatar: upload and delete require authentication', async () => {
  const unauthUpload = await postAvatar({});
  assert.equal(unauthUpload.status, 401);
  const unauthDelete = await fetch(`${baseUrl}/api/auth/me/avatar`, { method: 'DELETE' });
  assert.equal(unauthDelete.status, 401);
});

test('avatar: a member cannot upload for another member', async () => {
  const m1 = await registerMember();
  const m2 = await registerMember();
  const res = await postAvatar({ token: m1.token, extra: [['userId', m2.user.id]] });
  assert.equal(res.status, 200);
  const m1me = await request('GET', '/api/auth/me', { token: m1.token });
  const m2me = await request('GET', '/api/auth/me', { token: m2.token });
  assert.match(m1me.body.user.avatar, SECURE_URL_RE);
  assert.equal(m2me.body.user.avatar, '', 'another member must not be able to set m2 avatar');
  await request('DELETE', '/api/auth/me/avatar', { token: m1.token });
});

test('avatar: a trainer can only upload for themselves', async () => {
  const t1 = await createTrainer();
  const t2 = await createTrainer();
  const t1Tok = await login(t1.email, 'Trainer@123');
  const res = await postAvatar({ token: t1Tok, blob: JPEG, name: 'trainer.jpg', type: 'image/jpeg', extra: [['userId', String(t2._id)]] });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.user.avatar, /^\/uploads\/avatars\/[a-f0-9]{48}\.jpg$/);
  assert.equal(String(body.user._id), String(t1._id), 'avatar belongs to the authenticated trainer, not the injected userId');
  assert.ok(!body.user.avatar.includes(String(t1._id)), 'trainer id must not leak into the path');
  const t2Tok = await login(t2.email, 'Trainer@123');
  const t2me = await request('GET', '/api/auth/me', { token: t2Tok });
  assert.equal(t2me.body.user.avatar, '', 'another trainer must not receive the uploaded avatar');
  await request('DELETE', '/api/auth/me/avatar', { token: t1Tok });
  await request('DELETE', '/api/auth/me/avatar', { token: t2Tok });
});

// --- PROGRESS PHOTOS --------------------------------------------------------

test('photos: valid image upload is accepted with a secure name and ownable by the member', async () => {
  const member = await registerMember();
  const res = await postPhoto({ token: member.token, extra: [['angle', 'front'], ['caption', 'week 1']] });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(String(body.photo.user), String(member.user.id), 'photo must be owned by the uploader');
  assert.equal(body.photo.angle, 'front');
  assert.equal(body.photo.caption, 'week 1');
  assert.match(body.photo.url, SECURE_URL_RE);
  assert.ok(!body.photo.url.includes(String(member.user.id)));

  const mine = await request('GET', '/api/photos/my', { token: member.token });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.photos.length, 1);
  assert.equal(mine.body.photos[0].url, body.photo.url);
  assert.equal(mine.body.photos[0].isActive, true);

  await request('DELETE', `/api/photos/${body.photo._id}`, { token: member.token });
});

test('photos: oversized image is rejected (413) before anything is stored', async () => {
  const member = await registerMember();
  const before = dirCount(PHOTOS_DIR);
  const huge = Buffer.concat([PNG_1x1, Buffer.alloc(PHOTO_MAX_BYTES + 1024)]);
  const res = await postPhoto({ token: member.token, blob: huge });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.match(body.message, /too large/i);
  assert.equal(dirCount(PHOTOS_DIR), before, 'no file may be written for an oversized photo');
  const mine = await request('GET', '/api/photos/my', { token: member.token });
  assert.equal(mine.body.photos.length, 0);
});

test('photos: unsupported and malformed files are rejected', async () => {
  const member = await registerMember();
  const before = dirCount(PHOTOS_DIR);
  const cases = [
    [Buffer.from('not an image'), 'text/plain', 'notes.txt'],
    [EXE, 'application/x-msdownload', 'virus.exe'],
    [GARBAGE, 'image/png', 'spoof.png'],
    [PDF, 'image/png', 'fake.png'],
  ];
  for (const [blob, type, name] of cases) {
    const res = await postPhoto({ token: member.token, blob, name, type });
    assert.equal(res.status, 400, `expected 400 for ${name}`);
  }
  assert.equal(dirCount(PHOTOS_DIR), before, 'rejected photos must not leave files behind');
  const mine = await request('GET', '/api/photos/my', { token: member.token });
  assert.equal(mine.body.photos.length, 0);
});

test('photos: unauthenticated and unauthorized uploads are rejected', async () => {
  const anon = await postPhoto({});
  assert.equal(anon.status, 401);

  const trainer = await createTrainer();
  const tTok = await login(trainer.email, 'Trainer@123');
  const trainerUpload = await postPhoto({ token: tTok });
  assert.equal(trainerUpload.status, 403, 'trainers may not upload progress photos');

  const admin = await adminContext();
  const adminUpload = await postPhoto({ token: admin.token });
  assert.equal(adminUpload.status, 403, 'admins may not upload progress photos');
});

test('photos: a member cannot upload for another member (userId manipulation ignored)', async () => {
  const m1 = await registerMember();
  const m2 = await registerMember();
  const res = await postPhoto({ token: m1.token, extra: [['userId', m2.user.id], ['angle', 'back']] });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(String(body.photo.user), String(m1.user.id), 'upload must be attributed to the authenticated member');
  const m1mine = await request('GET', '/api/photos/my', { token: m1.token });
  const m2mine = await request('GET', '/api/photos/my', { token: m2.token });
  assert.equal(m1mine.body.photos.length, 1);
  assert.equal(m2mine.body.photos.length, 0, 'm2 must not receive a photo uploaded through m1');

  const m2Reads = await request('GET', `/api/photos/member/${m1.user.id}`, { token: m2.token });
  assert.equal(m2Reads.status, 403, 'a member must not read another members photo history');

  const admin = await adminContext();
  const adminReads = await request('GET', `/api/photos/member/${m1.user.id}`, { token: admin.token });
  assert.equal(adminReads.status, 200);
  assert.equal(adminReads.body.photos.length, 1);

  await request('DELETE', `/api/photos/${body.photo._id}`, { token: m1.token });
});

test('photos: a member cannot delete another members photo; can manage their own', async () => {
  const m1 = await registerMember();
  const m2 = await registerMember();
  const res = await postPhoto({ token: m1.token, extra: [['angle', 'front']] });
  const body = await res.json();
  const photoId = body.photo._id;
  const file = path.join(PHOTOS_DIR, path.basename(body.photo.url));

  const m2Delete = await request('DELETE', `/api/photos/${photoId}`, { token: m2.token });
  assert.equal(m2Delete.status, 403, 'a member must not delete another members photo');
  assert.equal(fs.existsSync(file), true, 'file must survive a rejected cross-user delete');

  const m1Delete = await request('DELETE', `/api/photos/${photoId}`, { token: m1.token });
  assert.equal(m1Delete.status, 200);
  assert.equal(fs.existsSync(file), false, 'own delete must remove the stored file');
});