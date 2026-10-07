import { MetadataRoute } from 'next';
import { query } from '@/lib/db';

const BASE_URL = process.env.SITE_URL || 'http://localhost:3000';

// Generate from current published content, including scheduled publications.
export const dynamic = 'force-dynamic';

type SitemapPost = { slug: string; updated_at: string | Date | null };
type SitemapShort = SitemapPost & { id: number };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fail visibly on a DB outage so crawlers retry. Returning a successful
  // fallback with only static pages silently drops every article URL.
  const [postsRes, bambooRes] = await Promise.all([
    query(
      `SELECT slug, updated_at FROM posts
       WHERE status = 'published' AND published_at <= CURRENT_TIMESTAMP
         AND slug IS NOT NULL AND slug <> '' ORDER BY published_at DESC`,
      [], { throwOnConnectionError: true }
    ),
    query(
      `SELECT id, slug, updated_at FROM bamboo_posts
       WHERE indexable = true AND deleted_at IS NULL AND seo_status = 'completed'
       ORDER BY created_at DESC`,
      [], { throwOnConnectionError: true }
    ),
  ]);

  const posts = (postsRes.rows as SitemapPost[]).map((post) => ({
    url: new URL(`/posts/${post.slug}`, BASE_URL).href,
    lastModified: post.updated_at ? new Date(post.updated_at) : undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
  const shorts = (bambooRes.rows as SitemapShort[]).map((post) => ({
    url: new URL(`/shorts/${post.slug ? `${post.id}-${post.slug}` : post.id}`, BASE_URL).href,
    lastModified: post.updated_at ? new Date(post.updated_at) : undefined,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  // Static pages are not modified every time a crawler reads the sitemap.
  return [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/shorts`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/collaboration`, changeFrequency: 'monthly', priority: 0.5 },
    ...posts,
    ...shorts,
  ];
}
