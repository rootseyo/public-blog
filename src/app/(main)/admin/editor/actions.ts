'use server';

import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { enqueueIndexNowUrls } from '@/lib/indexnow';
import { SITE_URL } from '@/lib/site-url';
import { verifyAdminSession } from '@/lib/admin-session';

async function checkAuth() {
  const cookieStore = await cookies();
  return verifyAdminSession(cookieStore.get('admin_session')?.value);
}

async function validateImageUrl(url: string): Promise<boolean> {
  if (!url) return true;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch (error) {
    return false;
  }
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s\uac00-\ud7af]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

let isColumnEnsured = false;
async function ensureMetaKeywordsColumn() {
  if (isColumnEnsured) return;
  try {
    await query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS meta_keywords TEXT');
    await query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS og_title TEXT');
    await query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS og_description TEXT');
    isColumnEnsured = true;
  } catch (e) {
    console.warn('[ensureMetaKeywordsColumn] Failed to add meta_keywords column:', e);
  }
}

export async function savePost(data: {
  title: string;
  content: string;
  thumbnailUrl: string;
  status?: string;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  publishedAt?: string | null;
  categoryId?: number | null;
}) {
  console.log('[savePost] Start processing...');
  if (!(await checkAuth())) {
    console.error('[savePost] Auth check failed');
    return { success: false, error: '권한이 없습니다.' };
  }

  await ensureMetaKeywordsColumn();

  const slug = data.slug || generateSlug(data.title);
  const { title, content, thumbnailUrl, metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription, status = 'published', publishedAt, categoryId } = data;
  console.log(`[savePost] Payload: title=${title}, slug=${slug}, status=${status}, publishedAt=${publishedAt}, categoryId=${categoryId}`);

  if (thumbnailUrl && !(await validateImageUrl(thumbnailUrl))) {
    console.warn(`[savePost] Invalid thumbnail URL: ${thumbnailUrl}`);
    return { success: false, error: '유효하지 않은 이미지 URL입니다.' };
  }

  const finalPublishedAt = publishedAt ? new Date(publishedAt).toISOString() : new Date().toISOString();

  try {
    console.log('[savePost] Executing INSERT query...');
    const res = await query(
      'INSERT INTO posts (title, content, thumbnail_url, slug, meta_title, meta_description, meta_keywords, og_title, og_description, status, published_at, category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, slug',
      [title, content, thumbnailUrl, slug, metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription, status, finalPublishedAt, categoryId || null]
    );
    console.log(`[savePost] Success! New ID: ${res.rows[0].id}`);
    revalidatePath('/');
    
    // Sitemap 갱신 (캐시 무효화)
    revalidatePath('/sitemap.xml');

    // Queue only the changed URL. The scheduled worker sends it in a batch.
    if (status === 'published') {
      const postUrl = `${SITE_URL}/posts/${slug}`;
      await enqueueIndexNowUrls([postUrl]).catch(err => console.error('[IndexNow] Queue failed:', err));
    }

    return { success: true, id: res.rows[0].id, slug: res.rows[0].slug };
  } catch (error: any) {
    console.error('[savePost] UNEXPECTED ERROR:', error);
    if (error.code === '23505') {
      return { success: false, error: '이미 존재하는 슬러그(Slug)입니다.' };
    }
    return { success: false, error: `글 저장 중 오류가 발생했습니다: ${error.message}` };
  }
}

export async function updatePost(id: number, data: {
  title: string;
  content: string;
  thumbnailUrl: string;
  status?: string;
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  publishedAt?: string | null;
  categoryId?: number | null;
}) {
  console.log(`[updatePost] Attempting to update post ID: ${id}`);
  
  if (!(await checkAuth())) {
    console.error('[updatePost] Auth check failed');
    return { success: false, error: '권한이 없습니다.' };
  }

  await ensureMetaKeywordsColumn();

  const slug = data.slug || generateSlug(data.title);
  const { title, content, thumbnailUrl, metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription, status, publishedAt, categoryId } = data;

  try {
    console.log(`[updatePost] Checking existence of ID: ${id}`);
    const checkRes = await query('SELECT id, status FROM posts WHERE id = $1', [id]);
    if (checkRes.rowCount === 0) {
      console.error(`[updatePost] Post not found with ID: ${id}`);
      return { success: false, error: '해당 글을 찾을 수 없습니다.' };
    }

    const currentStatus = checkRes.rows[0].status;
    const finalStatus = status || currentStatus;
    const finalPublishedAt = publishedAt ? new Date(publishedAt).toISOString() : undefined;

    console.log('[updatePost] Executing UPDATE query...');
    if (finalPublishedAt) {
      await query(
        'UPDATE posts SET title = $1, content = $2, thumbnail_url = $3, slug = $4, meta_title = $5, meta_description = $6, meta_keywords = $7, og_title = $8, og_description = $9, status = $10, published_at = $11, category_id = $12, updated_at = CURRENT_TIMESTAMP WHERE id = $13',
        [title, content, thumbnailUrl, slug, metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription, finalStatus, finalPublishedAt, categoryId || null, id]
      );
    } else {
      await query(
        'UPDATE posts SET title = $1, content = $2, thumbnail_url = $3, slug = $4, meta_title = $5, meta_description = $6, meta_keywords = $7, og_title = $8, og_description = $9, status = $10, category_id = $11, updated_at = CURRENT_TIMESTAMP WHERE id = $12',
        [title, content, thumbnailUrl, slug, metaTitle, metaDescription, metaKeywords, ogTitle, ogDescription, finalStatus, categoryId || null, id]
      );
    }
    
    console.log(`[updatePost] Update successful for ID: ${id}, Slug: ${slug}, Status: ${finalStatus}`);
    revalidatePath('/');
    revalidatePath(`/posts/${slug}`);

    // Sitemap 갱신 (캐시 무효화)
    revalidatePath('/sitemap.xml');

    // Queue only the changed URL. The scheduled worker sends it in a batch.
    if (finalStatus === 'published') {
      const postUrl = `${SITE_URL}/posts/${slug}`;
      await enqueueIndexNowUrls([postUrl]).catch(err => console.error('[IndexNow] Queue failed:', err));
    }

    return { success: true, slug };
  } catch (error: any) {
    console.error('[updatePost] UNEXPECTED ERROR:', error);
    if (error.code === '23505') {
      return { success: false, error: '이미 존재하는 슬러그(Slug)입니다.' };
    }
    return { success: false, error: `글 수정 중 오류 발생: ${error.message || '알 수 없는 오류'}` };
  }
}

export async function getPost(id: number) {
  try {
    const res = await query(
      'SELECT p.*, c.name as category_name, c.slug as category_slug FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1',
      [id]
    );
    return res.rows[0];
  } catch (error) {
    return null;
  }
}

export async function getPostBySlug(slug: string) {
  try {
    const res = await query(
      'SELECT p.*, c.name as category_name, c.slug as category_slug FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1',
      [slug]
    );
    return res.rows[0];
  } catch (error) {
    return null;
  }
}

export async function getPopularPosts() {
  try {
    const res = await query(
      "SELECT id, title, slug, views, published_at FROM posts WHERE status = 'published' AND published_at <= CURRENT_TIMESTAMP ORDER BY views DESC LIMIT 10"
    );
    return res.rows;
  } catch (error) {
    console.error('Error fetching popular posts:', error);
    return [];
  }
}

function decodeHtmlEntities(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®');
}

export async function fetchOgData(url: string) {
  if (!(await checkAuth())) return { success: false, error: 'Unauthorized' };

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      next: { revalidate: 3600 }
    });

    if (!response.ok) throw new Error('Failed to fetch URL');

    const html = await response.text();
    
    const getMetaContent = (property: string) => {
      const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
      const match = html.match(regex);
      if (match) return match[1];
      
      const reverseRegex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i');
      const reverseMatch = html.match(reverseRegex);
      return reverseMatch ? reverseMatch[1] : null;
    };

    const rawTitle = getMetaContent('og:title') || getMetaContent('twitter:title') || html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const rawDescription = getMetaContent('og:description') || getMetaContent('twitter:description') || getMetaContent('description');
    const image = getMetaContent('og:image') || getMetaContent('twitter:image:src') || getMetaContent('twitter:image');
    const siteName = getMetaContent('og:site_name');

    return {
      success: true,
      data: {
        title: decodeHtmlEntities(rawTitle?.trim()),
        description: decodeHtmlEntities(rawDescription?.trim()),
        image: image,
        url: url,
        siteName: decodeHtmlEntities(siteName)
      }
    };
  } catch (error: any) {
    console.error('OG fetch error:', error);
    return { success: false, error: error.message };
  }
}
