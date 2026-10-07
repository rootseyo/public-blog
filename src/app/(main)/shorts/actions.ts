'use server';

import { query } from '@/lib/db';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { enqueueIndexNowUrls } from '@/lib/indexnow';
import { SITE_URL } from '@/lib/site-url';

const SECURE_SALT = 'bamboo-forest-salt-key-2026';

function hashPassword(password: string): string {
  if (!password) return '';
  return crypto.createHash('sha256').update(password + SECURE_SALT).digest('hex');
}

function sanitizeString(str: string): string {
  if (!str) return '';
  // HTML escaping for XSS prevention
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function decodeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

async function ensureBambooCommentsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS bamboo_comments (
          id SERIAL PRIMARY KEY,
          bamboo_post_id INTEGER REFERENCES bamboo_posts(id) ON DELETE CASCADE,
          parent_id INTEGER REFERENCES bamboo_comments(id) ON DELETE CASCADE,
          author_name VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          password TEXT NOT NULL,
          client_token TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_bamboo_comments_post_id ON bamboo_comments(bamboo_post_id);
      CREATE INDEX IF NOT EXISTS idx_bamboo_comments_parent_id ON bamboo_comments(parent_id);
    `);
  } catch (err) {
    console.error('Error auto-migrating bamboo_comments:', err);
  }
}

let hasCheckedSeoColumns = false;

export async function ensureBambooSeoColumns() {
  if (hasCheckedSeoColumns) return;
  try {
    await query(`
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0 NOT NULL;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255);
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS meta_title VARCHAR(255);
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS meta_description TEXT;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS meta_keywords TEXT[];
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS summary TEXT;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS category VARCHAR(50);
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS tags TEXT[];
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS seo_status VARCHAR(20) DEFAULT 'pending' NOT NULL;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS indexable BOOLEAN DEFAULT true NOT NULL;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS ai_generated_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS ai_model VARCHAR(50);
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS ai_error TEXT;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS ai_retry_count INTEGER DEFAULT 0 NOT NULL;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS ai_last_attempt_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS seo_locked BOOLEAN DEFAULT false NOT NULL;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT false NOT NULL;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
      ALTER TABLE bamboo_posts ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
      CREATE INDEX IF NOT EXISTS idx_bamboo_posts_slug ON bamboo_posts(slug);
      CREATE INDEX IF NOT EXISTS idx_bamboo_posts_seo_status ON bamboo_posts(seo_status);
      CREATE INDEX IF NOT EXISTS idx_bamboo_posts_indexable ON bamboo_posts(indexable);
    `);
    hasCheckedSeoColumns = true;
  } catch (err) {
    console.error('Error auto-migrating bamboo_posts SEO columns:', err);
  }
}

export interface BambooPostData {
  id: number;
  author_name: string;
  content: string;
  likes: number;
  created_at: string;
  seo_title?: string;
  slug?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string[];
  summary?: string;
  category?: string;
  tags?: string[];
  seo_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  indexable?: boolean;
  ai_generated_at?: string;
  ai_model?: string;
  ai_error?: string;
  ai_retry_count?: number;
  ai_last_attempt_at?: string;
  seo_locked?: boolean;
  manual_override?: boolean;
  deleted_at?: string;
  content_hash?: string;
}

function formatPostRow(row: Record<string, unknown>): BambooPostData {
  return {
    id: Number(row.id),
    author_name: decodeHtml(String(row.author_name || '')),
    content: decodeHtml(String(row.content || '')),
    likes: Number(row.likes || 0),
    created_at: String(row.created_at || ''),
    seo_title: row.seo_title ? decodeHtml(String(row.seo_title)) : undefined,
    slug: row.slug ? String(row.slug) : undefined,
    meta_title: row.meta_title ? decodeHtml(String(row.meta_title)) : undefined,
    meta_description: row.meta_description ? decodeHtml(String(row.meta_description)) : undefined,
    meta_keywords: Array.isArray(row.meta_keywords) ? (row.meta_keywords as string[]) : [],
    summary: row.summary ? decodeHtml(String(row.summary)) : undefined,
    category: row.category ? decodeHtml(String(row.category)) : undefined,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    seo_status: (row.seo_status as BambooPostData['seo_status']) || 'pending',
    indexable: row.indexable !== false,
    ai_generated_at: row.ai_generated_at ? new Date(String(row.ai_generated_at)).toISOString() : undefined,
    ai_model: row.ai_model ? String(row.ai_model) : undefined,
    ai_error: row.ai_error ? String(row.ai_error) : undefined,
    ai_retry_count: Number(row.ai_retry_count || 0),
    ai_last_attempt_at: row.ai_last_attempt_at ? new Date(String(row.ai_last_attempt_at)).toISOString() : undefined,
    seo_locked: Boolean(row.seo_locked),
    manual_override: Boolean(row.manual_override),
    deleted_at: row.deleted_at ? new Date(String(row.deleted_at)).toISOString() : undefined,
    content_hash: row.content_hash ? String(row.content_hash) : undefined,
  };
}

export async function getBambooPosts(): Promise<BambooPostData[]> {
  await ensureBambooSeoColumns();
  try {
    const res = await query(
      `SELECT id, author_name, content, likes, created_at, seo_title, slug, meta_title, meta_description, 
              meta_keywords, summary, category, tags, seo_status, indexable, ai_generated_at, ai_model, 
              ai_error, ai_retry_count, ai_last_attempt_at, seo_locked, manual_override, deleted_at, content_hash 
       FROM bamboo_posts 
       WHERE deleted_at IS NULL 
       ORDER BY created_at DESC LIMIT 100`
    );
    return res.rows.map(formatPostRow);
  } catch (error) {
    console.error('Error fetching bamboo posts:', error);
    return [];
  }
}

export async function getBambooPostById(postId: number): Promise<BambooPostData | null> {
  await ensureBambooSeoColumns();
  try {
    const res = await query(
      `SELECT id, author_name, content, likes, created_at, seo_title, slug, meta_title, meta_description, 
              meta_keywords, summary, category, tags, seo_status, indexable, ai_generated_at, ai_model, 
              ai_error, ai_retry_count, ai_last_attempt_at, seo_locked, manual_override, deleted_at, content_hash 
       FROM bamboo_posts 
       WHERE id = $1 AND deleted_at IS NULL`,
      [postId]
    );
    if (res.rows.length === 0) return null;
    return formatPostRow(res.rows[0]);
  } catch (error) {
    console.error(`Error fetching bamboo post by id (${postId}):`, error);
    return null;
  }
}

import { generateBambooSeoWithOpenAI, calculateContentHash } from '@/lib/bamboo-seo';

/**
 * 게시글 비동기 SEO 처리 (OpenAI / Fallback)
 */
export async function processBambooSeo(postId: number, content: string, forceReplay = false) {
  await ensureBambooSeoColumns();
  try {
    // 1. 현재 post 상태 확인 및 locked 여부 확인
    const postRes = await query('SELECT seo_status, seo_locked FROM bamboo_posts WHERE id = $1', [postId]);
    if (postRes.rows.length === 0) return;

    const currentPost = postRes.rows[0];
    if (currentPost.seo_locked && !forceReplay) {
      console.log(`[Bamboo SEO] Post ${postId} is seo_locked. Skipping AI generation.`);
      return;
    }

    const contentHash = calculateContentHash(content);

    // 2. processing 상태 변경 (멱등성 확보)
    await query(
      'UPDATE bamboo_posts SET seo_status = $1, content_hash = $2 WHERE id = $3',
      ['processing', contentHash, postId]
    );

    // 3. OpenAI SEO 생성 실행
    const result = await generateBambooSeoWithOpenAI(postId, content);

    // 4. DB 결과 반영
    await query(
      `UPDATE bamboo_posts 
       SET seo_title = $1,
           slug = $2,
           meta_title = $3,
           meta_description = $4,
           meta_keywords = $5,
           summary = $6,
           category = $7,
           tags = $8,
           seo_status = $9,
           indexable = $10,
           ai_generated_at = CURRENT_TIMESTAMP,
           ai_model = $11,
           ai_error = $12
       WHERE id = $13`,
      [
        result.seoData.seoTitle,
        result.seoData.slug,
        result.seoData.metaTitle,
        result.seoData.metaDescription,
        result.seoData.metaKeywords,
        result.seoData.summary,
        result.seoData.category,
        result.seoData.tags,
        result.seoStatus,
        result.seoData.indexable,
        result.aiModel || null,
        result.aiError || null,
        postId,
      ]
    );

    revalidatePath('/shorts');
    revalidatePath(`/shorts/${postId}`);
    revalidatePath('/sitemap.xml');

    if (result.seoData.indexable) {
      const postUrl = `${SITE_URL}/shorts/${postId}-${result.seoData.slug}`;
      await enqueueIndexNowUrls([postUrl]).catch(err =>
        console.error('[IndexNow] Queue failed for bamboo post detail:', err)
      );
    }
  } catch (error) {
    console.error(`[Bamboo SEO] Error processing SEO for post ${postId}:`, error);
    try {
      await query(
        'UPDATE bamboo_posts SET seo_status = $1, ai_error = $2 WHERE id = $3',
        ['failed', String(error), postId]
      );
    } catch (dbErr) {
      console.error('[Bamboo SEO] Failed to update error status:', dbErr);
    }
  }
}

export async function likeBambooPost(postId: number): Promise<{ success: boolean; likes?: number; error?: string }> {
  await ensureBambooSeoColumns();
  try {
    const res = await query(
      'UPDATE bamboo_posts SET likes = likes + 1 WHERE id = $1 RETURNING likes',
      [postId]
    );
    if (res.rows.length === 0) {
      return { success: false, error: '존재하지 않는 게시글입니다.' };
    }
    revalidatePath('/shorts');
    revalidatePath(`/shorts/${postId}`);
    return { success: true, likes: Number(res.rows[0].likes) };
  } catch (error) {
    console.error('Error liking bamboo post:', error);
    return { success: false, error: '좋아요 처리 중 오류가 발생했습니다.' };
  }
}

export async function addBambooPost(formData: FormData, clientToken: string) {
  const content = formData.get('content') as string;
  const authorName = '익명';
  const password = 'anonymous-default-pwd';

  if (!content || !clientToken) {
    return { success: false, error: '모든 필드를 입력해 주세요.' };
  }

  const rawContent = content.trim();
  const plainText = rawContent.replace(/<[^>]*>?/gm, '');
  const nonSpaceLength = plainText.replace(/\s/g, '').length;

  if (plainText.trim().length === 0 || nonSpaceLength > 2000) {
    return { success: false, error: '공백을 제외한 글자 수는 1자 이상 2000자 이하로 작성해 주세요.' };
  }

  const cleanName = authorName;
  const cleanContent = sanitizeString(rawContent);

  try {
    const hashedPassword = hashPassword(password);
    const res = await query(
      'INSERT INTO bamboo_posts (author_name, content, password, client_token, seo_status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [cleanName, cleanContent, hashedPassword, clientToken, 'pending']
    );

    const newPostId = res.rows[0].id;

    // 비동기(Non-blocking)로 SEO 메타데이터 생성 실행 (사용자를 기다리게 하지 않음)
    processBambooSeo(newPostId, rawContent).catch(err => {
      console.error(`[Bamboo SEO] Background task failed for post ${newPostId}:`, err);
    });

    revalidatePath('/shorts');
    await enqueueIndexNowUrls([`${SITE_URL}/shorts`]).catch(err =>
      console.error('[IndexNow] Queue failed for bamboo:', err)
    );
    return { success: true, id: newPostId };
  } catch (error) {
    console.error('Error adding bamboo post:', error);
    return { success: false, error: '글 등록 중 오류가 발생했습니다.' };
  }
}

export async function updateBambooPost() {
  return { success: false, error: '수정이 불가능한 게시판입니다.' };
}

export async function deleteBambooPost(postId: number, clientToken?: string) {
  if (!clientToken) {
    return { success: false, error: '기기 정보가 필요합니다.' };
  }

  try {
    // Verify ownership
    const postRes = await query('SELECT client_token FROM bamboo_posts WHERE id = $1', [postId]);
    if (postRes.rows.length === 0) {
      return { success: false, error: '존재하지 않는 게시글입니다.' };
    }

    const { client_token: storedClientToken } = postRes.rows[0];

    if (storedClientToken !== clientToken) {
      return { success: false, error: '이 기기에서 작성한 글이 아닙니다. 삭제 권한이 없습니다.' };
    }

    await query('DELETE FROM bamboo_posts WHERE id = $1', [postId]);

    revalidatePath('/shorts');
    await enqueueIndexNowUrls([`${SITE_URL}/shorts`]).catch(err =>
      console.error('[IndexNow] Queue failed for bamboo:', err)
    );
    return { success: true };
  } catch (error) {
    console.error('Error deleting bamboo post:', error);
    return { success: false, error: '글 삭제 중 오류가 발생했습니다.' };
  }
}

export interface BambooCommentData {
  id: number;
  bamboo_post_id: number;
  parent_id: number | null;
  author_name: string;
  content: string;
  created_at: string;
}

/**
 * 특정 게시글 목록의 댓글들을 일괄 조회합니다.
 */
export async function getBambooComments(postIds: number[]): Promise<BambooCommentData[]> {
  if (!postIds || postIds.length === 0) return [];
  try {
    const res = await query(
      'SELECT id, bamboo_post_id, parent_id, author_name, content, created_at FROM bamboo_comments WHERE bamboo_post_id = ANY($1) ORDER BY created_at ASC',
      [postIds]
    );
    return res.rows.map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      bamboo_post_id: Number(row.bamboo_post_id),
      parent_id: row.parent_id ? Number(row.parent_id) : null,
      author_name: decodeHtml(String(row.author_name || '')),
      content: decodeHtml(String(row.content || '')),
      created_at: String(row.created_at || ''),
    }));
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '42P01') {
      console.log('bamboo_comments table does not exist. Running auto-migration...');
      await ensureBambooCommentsTable();
      try {
        const res = await query(
          'SELECT id, bamboo_post_id, parent_id, author_name, content, created_at FROM bamboo_comments WHERE bamboo_post_id = ANY($1) ORDER BY created_at ASC',
          [postIds]
        );
        return res.rows.map((row: Record<string, unknown>) => ({
          id: Number(row.id),
          bamboo_post_id: Number(row.bamboo_post_id),
          parent_id: row.parent_id ? Number(row.parent_id) : null,
          author_name: decodeHtml(String(row.author_name || '')),
          content: decodeHtml(String(row.content || '')),
          created_at: String(row.created_at || ''),
        }));
      } catch (retryError) {
        console.error('Retry fetching comments failed:', retryError);
      }
    }
    console.error('Error fetching bamboo comments:', error);
    return [];
  }
}

/**
 * 대나무숲 댓글을 추가합니다. (최대 2 depth 지원)
 */
export async function addBambooComment(
  postId: number,
  parentId: number | null,
  formData: FormData,
  clientToken: string,
  isRetry = false
): Promise<{ success: boolean; id?: number; error?: string }> {
  const authorName = '익명';
  const content = formData.get('content') as string;
  const password = 'anonymous-default-pwd';

  if (!content || !clientToken) {
    return { success: false, error: '모든 필드를 입력해 주세요.' };
  }

  const rawContent = content.trim();
  const nonSpaceLength = content.replace(/\s/g, '').length;

  if (rawContent.length === 0 || nonSpaceLength > 120) {
    return { success: false, error: '공백을 제외한 글자 수는 1자 이상 120자 이하로 작성해 주세요.' };
  }

  const cleanName = authorName;
  const cleanContent = sanitizeString(rawContent);

  try {
    // 2-depth (답글의 답글 제한) 검증
    if (parentId !== null) {
      const parentRes = await query('SELECT parent_id FROM bamboo_comments WHERE id = $1', [parentId]);
      if (parentRes.rows.length === 0) {
        return { success: false, error: '존재하지 않는 댓글에 대한 답글입니다.' };
      }
      if (parentRes.rows[0].parent_id !== null) {
        return { success: false, error: '답글에는 추가 답글을 작성할 수 없습니다. (최대 2 depth)' };
      }
    }

    const hashedPassword = hashPassword(password);
    const res = await query(
      'INSERT INTO bamboo_comments (bamboo_post_id, parent_id, author_name, content, password, client_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [postId, parentId, cleanName, cleanContent, hashedPassword, clientToken]
    );

    revalidatePath('/shorts');
    return { success: true, id: res.rows[0].id };
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '42P01' && !isRetry) {
      console.log('bamboo_comments table does not exist. Running auto-migration...');
      await ensureBambooCommentsTable();
      return addBambooComment(postId, parentId, formData, clientToken, true);
    }
    console.error('Error adding bamboo comment:', error);
    return { success: false, error: '댓글 등록 중 오류가 발생했습니다.' };
  }
}

/**
 * 대나무숲 댓글을 삭제합니다.
 */
export async function deleteBambooComment(commentId: number, clientToken?: string) {
  if (!clientToken) {
    return { success: false, error: '기기 정보가 필요합니다.' };
  }

  try {
    // 본인 확인
    const commentRes = await query('SELECT client_token FROM bamboo_comments WHERE id = $1', [commentId]);
    if (commentRes.rows.length === 0) {
      return { success: false, error: '존재하지 않는 댓글입니다.' };
    }

    const { client_token: storedClientToken } = commentRes.rows[0];

    if (storedClientToken !== clientToken) {
      return { success: false, error: '이 기기에서 작성한 댓글이 아닙니다. 삭제 권한이 없습니다.' };
    }

    await query('DELETE FROM bamboo_comments WHERE id = $1', [commentId]);

    revalidatePath('/shorts');
    return { success: true };
  } catch (error) {
    console.error('Error deleting bamboo comment:', error);
    return { success: false, error: '댓글 삭제 중 오류가 발생했습니다.' };
  }
}
