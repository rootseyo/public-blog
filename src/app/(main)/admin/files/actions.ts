'use server';

import { query as dbQuery } from '@/lib/db';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isAdmin } from '@/app/(main)/admin/actions';

const BUCKET = 'blog-uploads';
const UPLOAD_PREFIX = 'uploads';
const TRASH_PREFIX = 'trash';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'application/pdf',
]);

type StorageObject = {
  name: string;
  metadata?: { size?: number } | null;
  created_at?: string | null;
};

function objectPath(filename: string) {
  return `${UPLOAD_PREFIX}/${filename}`;
}

function assertFilename(filename: string) {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
    throw new Error('유효하지 않은 파일 이름입니다.');
  }
}

function toSafeFilename(filename: string, extension: string) {
  const baseName = filename.replace(/\.[^/.]+$/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${baseName || 'file'}${extension.toLowerCase()}`;
}

async function getStorageFiles() {
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).list(UPLOAD_PREFIX, {
    limit: 1000,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  return (data ?? []).filter((file) => Boolean(file.name) && file.name !== '.emptyFolderPlaceholder') as StorageObject[];
}

async function updatePostFileReferences(oldFilename: string, newFilename: string) {
  const oldPublicPath = `/uploads/${oldFilename}`;
  const newPublicPath = `/uploads/${newFilename}`;
  await dbQuery(`
    UPDATE posts
    SET
      thumbnail_url = REPLACE(thumbnail_url, $1, $2),
      content = REPLACE(content, $1, $2)
    WHERE thumbnail_url LIKE $3 OR content LIKE $3
  `, [oldPublicPath, newPublicPath, `%${oldFilename}%`]);
}

async function moveToTrash(filename: string) {
  const target = `${TRASH_PREFIX}/${Date.now()}_${filename}`;
  const { error } = await getSupabaseAdmin().storage.from(BUCKET).move(objectPath(filename), target);
  if (error) throw error;
}

export async function getFilesWithUsage() {
  if (!(await isAdmin())) throw new Error('Unauthorized');

  try {
    const [files, postsResult] = await Promise.all([
      getStorageFiles(),
      dbQuery('SELECT thumbnail_url, content FROM posts WHERE status != $1', ['deleted']),
    ]);
    const posts = postsResult.rows as { thumbnail_url: string | null; content: string | null }[];
    const rawContent = posts.map((post) => `${post.thumbnail_url ?? ''}${post.content ?? ''}`).join(' ');
    let decodedContent = rawContent;
    try { decodedContent = decodeURIComponent(rawContent); } catch { /* use raw content */ }
    const allContent = rawContent + decodedContent;

    return files.map((file) => ({
      filename: file.name,
      path: `/uploads/${file.name}`,
      size: Number(file.metadata?.size ?? 0),
      createdAt: new Date(file.created_at ?? 0),
      isUsed: allContent.includes(file.name),
    }));
  } catch (error) {
    console.error('Failed to get files:', error);
    throw new Error('파일 목록을 불러오지 못했습니다.');
  }
}

export async function renameFile(oldFilename: string, newFilename: string) {
  if (!(await isAdmin())) throw new Error('Unauthorized');
  assertFilename(oldFilename);

  const extension = oldFilename.includes('.') ? `.${oldFilename.split('.').pop()}` : '';
  const safeNewFilename = toSafeFilename(newFilename, extension);
  if (oldFilename === safeNewFilename) return { success: true, newFilename: safeNewFilename };

  const storage = getSupabaseAdmin().storage.from(BUCKET);
  const files = await getStorageFiles();
  if (files.some((file) => file.name === safeNewFilename)) return { success: false, error: '이미 존재하는 파일명입니다.' };

  const { error: moveError } = await storage.move(objectPath(oldFilename), objectPath(safeNewFilename));
  if (moveError) return { success: false, error: '이름 변경 중 오류가 발생했습니다.' };

  try {
    await updatePostFileReferences(oldFilename, safeNewFilename);
    return { success: true, newFilename: safeNewFilename };
  } catch (error) {
    await storage.move(objectPath(safeNewFilename), objectPath(oldFilename));
    console.error('Rename error:', error);
    return { success: false, error: '게시글 링크 갱신 중 오류가 발생했습니다.' };
  }
}

export async function renameAllFilesToSafeNames() {
  if (!(await isAdmin())) throw new Error('Unauthorized');

  const files = await getStorageFiles();
  const usedNames = new Set(files.map((file) => file.name));
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
    let target = toSafeFilename(file.name, extension);
    if (file.name === target) continue;

    usedNames.delete(file.name);
    let suffix = 1;
    const nameOnly = target.replace(/\.[^/.]+$/, '');
    while (usedNames.has(target)) target = `${nameOnly}-${suffix++}${extension.toLowerCase()}`;
    usedNames.add(target);

    const result = await renameFile(file.name, target);
    if (result.success) successCount++; else failCount++;
  }

  return { success: true, successCount, failCount };
}

export async function deleteFile(filename: string) {
  if (!(await isAdmin())) throw new Error('Unauthorized');
  try {
    assertFilename(filename);
    await moveToTrash(filename);
    return { success: true };
  } catch (error) {
    console.error('Failed to move file to trash:', error);
    return { success: false, error: '파일을 휴지통으로 이동하는 데 실패했습니다.' };
  }
}

export async function deleteUnusedFiles() {
  if (!(await isAdmin())) throw new Error('Unauthorized');
  const files = await getFilesWithUsage();
  let successCount = 0;
  let failCount = 0;

  for (const file of files.filter((item) => !item.isUsed)) {
    try {
      await moveToTrash(file.filename);
      successCount++;
    } catch (error) {
      console.error(`Failed to move ${file.filename} to trash:`, error);
      failCount++;
    }
  }
  return { success: true, successCount, failCount };
}

export async function replaceFile(filename: string, formData: FormData) {
  if (!(await isAdmin())) throw new Error('Unauthorized');
  const file = formData.get('file');
  if (!(file instanceof File)) return { success: false, error: '파일이 없습니다.' };

  try {
    assertFilename(filename);
    if (file.size > MAX_FILE_SIZE) return { success: false, error: '파일 크기는 50MB 이하여야 합니다.' };
    if (!ALLOWED_MIME_TYPES.has(file.type)) return { success: false, error: '지원하지 않는 파일 형식입니다.' };

    const storage = getSupabaseAdmin().storage.from(BUCKET);
    const source = objectPath(filename);
    const backup = `${TRASH_PREFIX}/${Date.now()}_backup_${filename}`;
    const { error: copyError } = await storage.copy(source, backup);
    if (copyError && !/not found/i.test(copyError.message)) throw copyError;

    const { error: uploadError } = await storage.upload(source, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) throw uploadError;
    return { success: true };
  } catch (error) {
    console.error('Failed to replace file:', error);
    return { success: false, error: '파일 교체에 실패했습니다.' };
  }
}
