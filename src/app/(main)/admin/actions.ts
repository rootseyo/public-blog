'use server';

import { query } from '@/lib/db';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { processPendingIndexNowSubmissions } from '@/lib/indexnow';
import { createAdminSession, secureEquals, verifyAdminSession } from '@/lib/admin-session';

export async function login(formData: FormData) {
  const username = formData.get('username') as string;
  const password = formData.get('password') as string;

  try {
    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;
    const sessionSecret = process.env.ADMIN_SESSION_SECRET;
    if (!expectedUsername || !expectedPassword || !sessionSecret) {
      return { success: false, error: '관리자 계정 환경 변수(ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SESSION_SECRET)를 설정해 주세요.' };
    }
    if (secureEquals(username, expectedUsername) && secureEquals(password, expectedPassword)) {
      const cookieStore = await cookies();
      cookieStore.set('admin_session', createAdminSession(username), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      });
      return { success: true };
    }
    return { success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: '로그인 처리 중 오류가 발생했습니다.' };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
}

export async function isAdmin() {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get('admin_session')?.value);
}

export async function deletePost(id: number) {
  if (!(await isAdmin())) {
    return { success: false, error: '권한이 없습니다.' };
  }

  try {
    // Soft delete: status를 'deleted'로 변경하고 deleted_at 기록
    await query(
      'UPDATE posts SET status = $1, deleted_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['deleted', id]
    );
    
    // Sitemap 갱신 (캐시 무효화)
    revalidatePath('/sitemap.xml');

    return { success: true };
  } catch (error) {
    console.error('Delete error:', error);
    return { success: false, error: '삭제 중 오류가 발생했습니다.' };
  }
}

export async function permanentlyDeletePost(id: number) {
  if (!(await isAdmin())) {
    return { success: false, error: '권한이 없습니다.' };
  }

  try {
    await query('BEGIN');
    
    // 1. 관련 조회 기록 먼저 삭제
    await query('DELETE FROM post_views WHERE post_id = $1', [id]);
    
    // 2. visitor_logs의 post_id를 NULL로 설정
    await query('UPDATE visitor_logs SET post_id = NULL WHERE post_id = $1', [id]);
    
    // 3. 실제 포스트 삭제
    await query('DELETE FROM posts WHERE id = $1', [id]);
    
    await query('COMMIT');

    // Sitemap 갱신 (캐시 무효화)
    revalidatePath('/sitemap.xml');

    return { success: true };
  } catch (error) {
    await query('ROLLBACK');
    console.error('Permanent delete error:', error);
    return { success: false, error: '영구 삭제 중 오류가 발생했습니다.' };
  }
}

/**
 * 15일 이상 경과된 'deleted' 상태의 글들을 영구 삭제합니다.
 * 이 작업은 주기적으로 호출되거나 특정 동작 시 수행될 수 있습니다.
 */
export async function permanentlyDeleteOldPosts() {
  if (!(await isAdmin())) return { success: false };

  try {
    const res = await query(
      "DELETE FROM posts WHERE status = 'deleted' AND deleted_at < CURRENT_TIMESTAMP - INTERVAL '15 days' RETURNING id"
    );
    return { success: true, count: res.rowCount };
  } catch (error) {
    console.error('Purge error:', error);
    return { success: false };
  }
}

/**
 * 내부 IP 및 로컬 환경에서 유입된 로그를 삭제합니다.
 */
export async function cleanupInternalLogs() {
  if (!(await isAdmin())) return { success: false };

  try {
    const res = await query(`
      DELETE FROM visitor_logs 
      WHERE 
        ip_address = '127.0.0.1' OR 
        ip_address = '::1' OR 
        ip_address LIKE '192.168.%' OR
        referrer LIKE '%localhost%' OR
        referrer LIKE '%127.0.0.1%' OR
        referrer LIKE '%192.168.%'
    `);
    return { success: true, count: res.rowCount };
  } catch (error) {
    console.error('Cleanup internal logs error:', error);
    return { success: false };
  }
}

export async function getAllComments() {
  if (!(await isAdmin())) return [];

  try {
    const res = await query(`
      SELECT 
        c.id, 
        c.author_name, 
        c.content, 
        c.reports, 
        c.likes, 
        c.created_at, 
        c.deleted_at, 
        p.title as post_title,
        p.slug as post_slug
      FROM comments c
      LEFT JOIN posts p ON c.post_id = p.id
      ORDER BY c.created_at DESC
    `);
    return res.rows;
  } catch (error) {
    console.error('Fetch comments error:', error);
    return [];
  }
}

export async function toggleCommentDelete(id: number, isDeleted: boolean) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  try {
    if (isDeleted) {
      await query('UPDATE comments SET deleted_at = NULL WHERE id = $1', [id]);
    } else {
      await query('UPDATE comments SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    }
    return { success: true };
  } catch (error) {
    console.error('Toggle comment delete error:', error);
    return { success: false, error: '상태 변경 중 오류가 발생했습니다.' };
  }
}

export async function permanentlyDeleteComment(id: number) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  try {
    await query('DELETE FROM comments WHERE id = $1', [id]);
    return { success: true };
  } catch (error) {
    console.error('Permanent delete comment error:', error);
    return { success: false, error: '영구 삭제 중 오류가 발생했습니다.' };
  }
}

// --- Category Actions ---

export async function getCategories(includeHidden: boolean = true) {
  try {
    const queryStr = includeHidden 
      ? 'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
      : 'SELECT * FROM categories WHERE is_visible = TRUE ORDER BY sort_order ASC, name ASC';
    const res = await query(queryStr);
    return res.rows;
  } catch (error) {
    console.error('Fetch categories error:', error);
    return [];
  }
}

export async function addCategory(formData: FormData) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;

  if (!name || !slug) return { success: false, error: '이름과 슬러그를 입력해주세요.' };

  try {
    await query(
      'INSERT INTO categories (name, slug) VALUES ($1, $2)',
      [name, slug]
    );
    return { success: true };
  } catch (error: any) {
    console.error('Add category error:', error);
    if (error.code === '23505') return { success: false, error: '이미 존재하는 슬러그입니다.' };
    return { success: false, error: '카테고리 추가 중 오류가 발생했습니다.' };
  }
}

export async function updateCategory(id: number, formData: FormData) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  const name = formData.get('name') as string;
  const slug = formData.get('slug') as string;
  const sortOrder = parseInt(formData.get('sortOrder') as string || '0');

  try {
    await query(
      'UPDATE categories SET name = $1, slug = $2, sort_order = $3 WHERE id = $4',
      [name, slug, sortOrder, id]
    );
    return { success: true };
  } catch (error: any) {
    console.error('Update category error:', error);
    if (error.code === '23505') return { success: false, error: '이미 존재하는 슬러그입니다.' };
    return { success: false, error: '카테고리 수정 중 오류가 발생했습니다.' };
  }
}

export async function deleteCategory(id: number) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  try {
    // 해당 카테고리를 사용하는 게시글이 있는지 확인
    const postsRes = await query('SELECT id FROM posts WHERE category_id = $1 LIMIT 1', [id]);
    if (postsRes.rows.length > 0) {
      return { success: false, error: '해당 카테고리를 사용하는 게시글이 있어 삭제할 수 없습니다. 먼저 게시글의 카테고리를 변경해주세요.' };
    }

    await query('DELETE FROM categories WHERE id = $1', [id]);
    return { success: true };
  } catch (error) {
    console.error('Delete category error:', error);
    return { success: false, error: '카테고리 삭제 중 오류가 발생했습니다.' };
  }
}

export async function toggleCategoryVisibility(id: number, currentVisibility: boolean) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  try {
    await query('UPDATE categories SET is_visible = $1 WHERE id = $2', [!currentVisibility, id]);
    return { success: true };
  } catch (error) {
    console.error('Toggle visibility error:', error);
    return { success: false, error: '상태 변경 중 오류가 발생했습니다.' };
  }
}

export async function updateCategoryOrders(categoryOrders: { id: number; sort_order: number }[]) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  try {
    await query('BEGIN');
    for (const item of categoryOrders) {
      await query('UPDATE categories SET sort_order = $1 WHERE id = $2', [item.sort_order, item.id]);
    }
    await query('COMMIT');
    return { success: true };
  } catch (error) {
    await query('ROLLBACK');
    console.error('Update category orders error:', error);
    return { success: false, error: '순서 변경 중 오류가 발생했습니다.' };
  }
}

/**
 * DB 스키마 마이그레이션을 실행합니다.
 */
export async function runMigrations() {
  if (!(await isAdmin())) return { success: false };

  try {
    // comments 및 visitor_logs 테이블에 새 컬럼 추가
    await query(`
      DO $$ 
      BEGIN 
        -- visitor_logs 컬럼 추가
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='browser') THEN
            ALTER TABLE visitor_logs ADD COLUMN browser TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='os') THEN
            ALTER TABLE visitor_logs ADD COLUMN os TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='device_model') THEN
            ALTER TABLE visitor_logs ADD COLUMN device_model TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='visitor_logs' AND column_name='is_bot') THEN
            ALTER TABLE visitor_logs ADD COLUMN is_bot BOOLEAN DEFAULT FALSE;
        END IF;

        CREATE INDEX IF NOT EXISTS idx_visitor_logs_is_bot ON visitor_logs(is_bot);

        -- 기존 로그는 원본 User-Agent는 있지만 분류 컬럼이 비어 있을 수 있다.
        -- NULL인 행만 보정해 이후 관리자 통계에서 'Other'로 뭉뚱그려지지 않게 한다.
        UPDATE visitor_logs
        SET
          os = CASE
            WHEN user_agent ~* '(bot\\y|crawler|spider|slurp|facebookexternalhit|google-inspectiontool|bytespider|externalagent|bingpreview|yandex|yeti|daumoa|applebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|gptbot|chatgpt|claudebot|anthropic|perplexity|amazonbot|cohere|ccbot|feedfetcher|mediapartners-google|lighthouse|headlesschrome|headless)' THEN 'Crawler/Bot'
            WHEN user_agent ~* 'android' THEN 'Android'
            WHEN user_agent ~* 'iphone|ipad|ipod' THEN 'iOS'
            WHEN user_agent ~* 'macintosh|mac os' THEN 'macOS'
            WHEN user_agent ~* 'windows' THEN 'Windows'
            WHEN user_agent ~* 'linux' THEN 'Linux'
            ELSE 'Other'
          END,
          browser = CASE
            WHEN user_agent ~* '(bot\\y|crawler|spider|slurp|facebookexternalhit|google-inspectiontool|bytespider|externalagent|bingpreview|yandex|yeti|daumoa|applebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|gptbot|chatgpt|claudebot|anthropic|perplexity|amazonbot|cohere|ccbot|feedfetcher|mediapartners-google|lighthouse|headlesschrome|headless)' THEN 'Crawler/Bot'
            WHEN user_agent ~* 'kakao' THEN 'KakaoTalk'
            WHEN user_agent ~* 'naver' THEN 'Naver'
            WHEN user_agent ~* 'instagram' THEN 'Instagram'
            WHEN user_agent ~* 'linkedinapp' THEN 'LinkedIn'
            WHEN user_agent ~* 'samsungbrowser/' THEN 'Samsung Internet'
            WHEN user_agent ~* 'edg/' THEN 'Edge'
            WHEN user_agent ~* 'opr/|opera' THEN 'Opera'
            WHEN user_agent ~* 'firefox/|fxios/' THEN 'Firefox'
            WHEN user_agent ~* 'crios/|chrome/|chromium/' THEN 'Chrome'
            WHEN user_agent ~* 'safari/' THEN 'Safari'
            ELSE 'Other'
          END,
          device_type = CASE
            WHEN user_agent ~* '(bot\\y|crawler|spider|slurp|facebookexternalhit|google-inspectiontool|bytespider|externalagent|bingpreview|yandex|yeti|daumoa|applebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|gptbot|chatgpt|claudebot|anthropic|perplexity|amazonbot|cohere|ccbot|feedfetcher|mediapartners-google|lighthouse|headlesschrome|headless)' THEN 'Crawler/Bot'
            WHEN user_agent ~* '(tablet|ipad|playbook|silk)|android(?!.*mobi)' THEN 'tablet'
            WHEN user_agent ~* 'mobile|android|iphone|ipad|ipod|iemobile|blackberry|kindle|silk-accelerated|(hpw|web)os|opera m(obi|ini)|ucbrowser|ucweb|mobi' THEN 'mobile'
            ELSE 'desktop'
          END,
          device_model = CASE
            WHEN user_agent ~* '(bot\\y|crawler|spider|slurp|facebookexternalhit|google-inspectiontool|bytespider|externalagent|bingpreview|yandex|yeti|daumoa|applebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|gptbot|chatgpt|claudebot|anthropic|perplexity|amazonbot|cohere|ccbot|feedfetcher|mediapartners-google|lighthouse|headlesschrome|headless)' THEN 'Crawler/Bot'
            ELSE 'Unknown'
          END,
          is_bot = CASE
            WHEN user_agent ~* '(bot\\y|crawler|spider|slurp|facebookexternalhit|google-inspectiontool|bytespider|externalagent|bingpreview|yandex|yeti|daumoa|applebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|gptbot|chatgpt|claudebot|anthropic|perplexity|amazonbot|cohere|ccbot|feedfetcher|mediapartners-google|lighthouse|headlesschrome|headless)' THEN TRUE
            WHEN device_type = 'Crawler/Bot' OR os = 'Crawler/Bot' OR browser = 'Crawler/Bot' THEN TRUE
            ELSE FALSE
          END
        WHERE user_agent IS NOT NULL
          AND (os IS NULL OR browser IS NULL OR device_type IS NULL OR device_model IS NULL OR is_bot IS NULL);

        -- comments 컬럼 추가
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='deleted_at') THEN
            ALTER TABLE comments ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='likes') THEN
            ALTER TABLE comments ADD COLUMN likes INTEGER DEFAULT 0;
        END IF;

        -- categories 테이블 생성
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            is_visible BOOLEAN DEFAULT TRUE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- posts 테이블에 category_id 추가
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='category_id') THEN
            ALTER TABLE posts ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
        END IF;

        -- bamboo_posts 테이블 생성 (익명 대나무숲 게시판)
        CREATE TABLE IF NOT EXISTS bamboo_posts (
            id SERIAL PRIMARY KEY,
            author_name VARCHAR(50) NOT NULL,
            content TEXT NOT NULL,
            password TEXT NOT NULL,
            client_token TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_bamboo_posts_created_at ON bamboo_posts(created_at DESC);

        -- forbidden_words 테이블 생성
        CREATE TABLE IF NOT EXISTS forbidden_words (
            id SERIAL PRIMARY KEY,
            word VARCHAR(100) UNIQUE NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'other',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- 금칙어 초기값 설정
        INSERT INTO forbidden_words (word, category)
        SELECT w.word, w.category FROM (
            VALUES 
            ('시발', 'abuse'), ('씨발', 'abuse'), ('개새끼', 'abuse'), ('병신', 'abuse'), 
            ('좆', 'abuse'), ('씹', 'abuse'), ('미친놈', 'abuse'), ('미친년', 'abuse'), 
            ('씨발놈', 'abuse'), ('씨발년', 'abuse'), ('지랄', 'abuse'), ('존나', 'abuse'), 
            ('꺼져', 'abuse'), ('닥쳐', 'abuse'),
            ('섹스', 'sexual'), ('자위', 'sexual'), ('야동', 'sexual'), ('성인물', 'sexual'), 
            ('조건만남', 'sexual'), ('보지', 'sexual'), ('자지', 'sexual'), ('몸캠', 'sexual'),
            ('문재앙', 'political'), ('찢재명', 'political'), ('닭근혜', 'political'), 
            ('쥐박이', 'political'), ('뇌물현', 'political'), ('대깨문', 'political'),
            ('틀딱', 'political')
        ) AS w(word, category)
        WHERE NOT EXISTS (SELECT 1 FROM forbidden_words);

        -- bamboo_comments 테이블 생성 (익명 대나무숲 댓글)
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

        -- 기존 VARCHAR(120) 컬럼을 TEXT로 변경 마이그레이션
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bamboo_posts' AND column_name='content' AND data_type='character varying') THEN
            ALTER TABLE bamboo_posts ALTER COLUMN content TYPE TEXT;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bamboo_comments' AND column_name='content' AND data_type='character varying') THEN
            ALTER TABLE bamboo_comments ALTER COLUMN content TYPE TEXT;
        END IF;

        -- indexing_schedules 테이블 생성 및 시드 데이터 삽입
        CREATE TABLE IF NOT EXISTS indexing_schedules (
            id INTEGER PRIMARY KEY DEFAULT 1,
            scheduled_hour INTEGER DEFAULT 3 NOT NULL CHECK (scheduled_hour >= 0 AND scheduled_hour <= 23),
            enabled BOOLEAN DEFAULT TRUE NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO indexing_schedules (id, scheduled_hour, enabled)
        SELECT 1, 3, TRUE
        WHERE NOT EXISTS (SELECT 1 FROM indexing_schedules WHERE id = 1);

        -- indexing_logs 테이블 생성
        CREATE TABLE IF NOT EXISTS indexing_logs (
            id SERIAL PRIMARY KEY,
            trigger_type VARCHAR(20) NOT NULL,
            status VARCHAR(20) NOT NULL,
            message TEXT,
            url_count INTEGER DEFAULT 0 NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      END $$;
    `);
    return { success: true };
  } catch (error) {
    console.error('Migration error:', error);
    return { success: false };
  }
}

/**
 * 대기 중인 변경 URL만 IndexNow에 전송합니다.
 */
export async function triggerIndexNow() {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };

  try {
    const result = await processPendingIndexNowSubmissions();
    if (result.deferred) return result;
    if (!result.queued) return { success: true, message: '전송 대기 중인 변경 URL이 없습니다.' };
    return result;
  } catch (error) {
    console.error('IndexNow trigger error:', error);
    return { success: false, error: 'IndexNow 전송 중 오류가 발생했습니다.' };
  }
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

import { processBambooSeo } from '../shorts/actions';
import { normalizeSlug } from '@/lib/bamboo-seo';

/**
 * 익명 대나무숲 게시글 전체를 조회합니다. (관리자용)
 */
export async function adminGetBambooPosts() {
  if (!(await isAdmin())) return [];
  try {
    const res = await query(
      `SELECT id, author_name, content, created_at, seo_title, slug, meta_title, meta_description, 
              meta_keywords, summary, category, tags, seo_status, indexable, ai_generated_at, ai_model, 
              ai_error, seo_locked
       FROM bamboo_posts ORDER BY created_at DESC`
    );
    return res.rows.map((row: any) => ({
      ...row,
      author_name: decodeHtml(row.author_name),
      content: decodeHtml(row.content),
      seo_title: row.seo_title ? decodeHtml(row.seo_title) : undefined,
      slug: row.slug || undefined,
      meta_title: row.meta_title ? decodeHtml(row.meta_title) : undefined,
      meta_description: row.meta_description ? decodeHtml(row.meta_description) : undefined,
      meta_keywords: Array.isArray(row.meta_keywords) ? row.meta_keywords : [],
      summary: row.summary ? decodeHtml(row.summary) : undefined,
      category: row.category ? decodeHtml(row.category) : undefined,
      tags: Array.isArray(row.tags) ? row.tags : [],
      seo_status: row.seo_status || 'pending',
      indexable: row.indexable !== false,
      ai_generated_at: row.ai_generated_at ? new Date(row.ai_generated_at).toISOString() : undefined,
      ai_model: row.ai_model || undefined,
      ai_error: row.ai_error || undefined,
      seo_locked: Boolean(row.seo_locked),
    }));
  } catch (error) {
    console.error('Fetch admin bamboo posts error:', error);
    return [];
  }
}

/**
 * 관리자용 SEO 메타데이터 수동 수정
 */
export async function adminUpdateBambooSeo(
  id: number,
  seoData: {
    seo_title: string;
    slug: string;
    meta_title: string;
    meta_description: string;
    meta_keywords: string[];
    summary: string;
    category: string;
    tags: string[];
    indexable: boolean;
    seo_locked?: boolean;
  }
) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    const normalizedSlug = normalizeSlug(seoData.slug, id);
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
           indexable = $9,
           seo_locked = $10,
           seo_status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11`,
      [
        seoData.seo_title.trim(),
        normalizedSlug,
        seoData.meta_title.trim(),
        seoData.meta_description.trim(),
        seoData.meta_keywords,
        seoData.summary.trim(),
        seoData.category.trim(),
        seoData.tags,
        seoData.indexable,
        seoData.seo_locked !== false,
        id,
      ]
    );

    revalidatePath('/shorts');
    revalidatePath(`/shorts/${id}`);
    revalidatePath('/sitemap.xml');
    return { success: true };
  } catch (error) {
    console.error('Admin update bamboo SEO error:', error);
    return { success: false, error: 'SEO 수정 중 오류가 발생했습니다.' };
  }
}

/**
 * 관리자용 AI SEO 강제 재생성
 */
export async function adminRegenerateBambooSeo(id: number) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    const res = await query('SELECT content FROM bamboo_posts WHERE id = $1', [id]);
    if (res.rows.length === 0) {
      return { success: false, error: '게시글이 존재하지 않습니다.' };
    }
    await processBambooSeo(id, res.rows[0].content, true);
    return { success: true };
  } catch (error) {
    console.error('Admin regenerate bamboo SEO error:', error);
    return { success: false, error: 'SEO 재생성 중 오류가 발생했습니다.' };
  }
}

import {
  getBambooSeoMigrationStatus as fetchMigrationStatus,
  runDryRun as fetchDryRun,
  executeBambooSeoMigration as fetchExecuteMigration,
  MigrationOptions
} from '@/lib/bamboo-seo-migration';

export async function getBambooSeoMigrationStatusAction() {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    const stats = await fetchMigrationStatus();
    return { success: true, stats };
  } catch (error) {
    console.error('Fetch migration status error:', error);
    return { success: false, error: '상태 조회 중 오류가 발생했습니다.' };
  }
}

export async function runBambooSeoDryRunAction(options: MigrationOptions = {}) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    const dryRunData = await fetchDryRun(options);
    return { success: true, dryRunData };
  } catch (error) {
    console.error('Dry-run action error:', error);
    return { success: false, error: 'Dry-run 실행 중 오류가 발생했습니다.' };
  }
}

export async function runBambooSeoMigrationAction(options: MigrationOptions = {}) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    const result = await fetchExecuteMigration(options);
    revalidatePath('/shorts');
    revalidatePath('/admin/shorts');
    revalidatePath('/sitemap.xml');
    return { success: true, result };
  } catch (error) {
    console.error('Execute migration action error:', error);
    return { success: false, error: '마이그레이션 실행 중 오류가 발생했습니다.' };
  }
}

/**
 * 익명 대나무숲 게시글을 수정합니다. (관리자용)
 */
export async function adminUpdateBambooPost(id: number, content: string) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  const cleanContent = content.trim();
  const plainText = cleanContent.replace(/<[^>]*>?/gm, '');
  const nonSpaceLength = plainText.replace(/\s/g, '').length;
  if (plainText.trim().length === 0 || nonSpaceLength > 2000) {
    return { success: false, error: '공백을 제외한 글자 수는 1자 이상 2000자 이하로 작성해 주세요.' };
  }
  try {
    await query('UPDATE bamboo_posts SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
      cleanContent,
      id
    ]);
    return { success: true };
  } catch (error) {
    console.error('Admin update bamboo post error:', error);
    return { success: false, error: '수정 중 오류가 발생했습니다.' };
  }
}

/**
 * 익명 대나무숲 게시글을 영구 삭제합니다. (관리자용)
 */
export async function adminDeleteBambooPost(id: number) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    await query('DELETE FROM bamboo_posts WHERE id = $1', [id]);
    return { success: true };
  } catch (error) {
    console.error('Admin delete bamboo post error:', error);
    return { success: false, error: '삭제 중 오류가 발생했습니다.' };
  }
}

/**
 * 등록된 모든 금칙어를 조회합니다.
 */
export async function getForbiddenWords() {
  if (!(await isAdmin())) return [];
  try {
    const res = await query(
      'SELECT id, word, category, created_at FROM forbidden_words ORDER BY category ASC, word ASC'
    );
    return res.rows;
  } catch (error) {
    console.error('Fetch forbidden words error:', error);
    return [];
  }
}

/**
 * 금칙어를 추가합니다.
 */
export async function addForbiddenWord(word: string, category: string) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  const cleanWord = word.trim();
  if (!cleanWord) return { success: false, error: '단어를 입력해 주세요.' };
  try {
    await query('INSERT INTO forbidden_words (word, category) VALUES ($1, $2)', [cleanWord, category]);
    return { success: true };
  } catch (error: any) {
    console.error('Add forbidden word error:', error);
    if (error.code === '23505') return { success: false, error: '이미 존재하는 금칙어입니다.' };
    return { success: false, error: '금칙어 추가 중 오류가 발생했습니다.' };
  }
}

/**
 * 금칙어를 삭제합니다.
 */
export async function deleteForbiddenWord(id: number) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    await query('DELETE FROM forbidden_words WHERE id = $1', [id]);
    return { success: true };
  } catch (error) {
    console.error('Delete forbidden word error:', error);
    return { success: false, error: '금칙어 삭제 중 오류가 발생했습니다.' };
  }
}

/**
 * 인덱싱 스케줄 설정을 조회합니다.
 */
export async function getIndexingSchedule() {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    const res = await query('SELECT scheduled_hour, enabled FROM indexing_schedules WHERE id = 1');
    if (res.rows.length > 0) {
      return { success: true, schedule: res.rows[0] };
    }
    return { success: true, schedule: { scheduled_hour: 3, enabled: true } };
  } catch (error) {
    console.error('Fetch indexing schedule error:', error);
    return { success: false, error: '설정을 불러오는 중 오류가 발생했습니다.' };
  }
}

/**
 * 인덱싱 스케줄 설정을 저장합니다.
 */
export async function updateIndexingSchedule(scheduledHour: number, enabled: boolean) {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    await query(
      'UPDATE indexing_schedules SET scheduled_hour = $1, enabled = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [scheduledHour, enabled]
    );
    
    // 백그라운드 타이머에 실시간 반영하기 위해 scheduleNextRun 동적 실행
    try {
      const { scheduleNextRun } = await import('@/lib/cron-scheduler');
      await scheduleNextRun();
    } catch (err) {
      console.warn('Failed to reschedule on the fly:', err);
    }

    return { success: true };
  } catch (error) {
    console.error('Update indexing schedule error:', error);
    return { success: false, error: '설정을 저장하는 중 오류가 발생했습니다.' };
  }
}

/**
 * 최근 인덱싱 전송 로그 목록을 가져옵니다.
 */
export async function getIndexingLogs() {
  if (!(await isAdmin())) return [];
  try {
    const res = await query(
      'SELECT id, trigger_type, status, message, url_count, created_at FROM indexing_logs ORDER BY created_at DESC LIMIT 50'
    );
    return res.rows;
  } catch (error) {
    console.error('Fetch indexing logs error:', error);
    return [];
  }
}

/**
 * 수동으로 즉시 인덱싱을 전송하고 로그를 쌓습니다.
 */
export async function triggerManualIndexing() {
  if (!(await isAdmin())) return { success: false, error: '권한이 없습니다.' };
  try {
    const { runIndexingTask } = await import('@/lib/cron-scheduler');
    return await runIndexingTask('manual');
  } catch (error: any) {
    console.error('Manual indexing trigger error:', error);
    return { success: false, error: error.message || '수동 전송 중 오류가 발생했습니다.' };
  }
}
