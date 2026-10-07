import { query } from '@/lib/db';
import PostListArea from '@/components/PostListArea';
import SearchBar from '@/components/SearchBar';
import ScrollToTop from '@/components/ScrollToTop';
import ViewTracker from '../../posts/ViewTracker';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import styles from '../../page.module.css';
import { getPopularPosts } from '@/app/(main)/admin/editor/actions';
import { SITE_URL } from '@/lib/site-url';

export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string }>;
}

async function getCategoryBySlug(slug: string) {
  const res = await query('SELECT * FROM categories WHERE slug = $1', [slug]);
  return res.rows[0];
}

async function getPostsByCategory(categoryId: number) {
  const res = await query(`
    SELECT p.*, c.name as category_name,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
    FROM posts p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.category_id = $1 AND p.status = 'published' AND p.published_at <= CURRENT_TIMESTAMP 
    ORDER BY p.published_at DESC
  `, [categoryId]);
  return res.rows;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return { title: '카테고리를 찾을 수 없습니다 | Bright Notes' };
  }

  const title = `${category.name} 인사이트와 실무 이야기 | Bright Notes`;
  const description = `${category.name}에 관한 실무 경험, 새로운 시도와 인사이트를 Bright Notes에서 확인해 보세요.`;
  const canonicalUrl = `${SITE_URL}/categories/${encodeURIComponent(slug)}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl },
  };
}

export default async function CategoryPage(props: Props) {
  const params = await props.params;
  const slug = decodeURIComponent(params.slug);
  
  const category = await getCategoryBySlug(slug);
  if (!category) {
    notFound();
  }

  const [posts, popularPosts] = await Promise.all([
    getPostsByCategory(category.id),
    getPopularPosts()
  ]);

  return (
    <main className={styles.main}>
      <ViewTracker path={`/categories/${slug}`} />
      
      <SearchBar />

      <div className={styles.blogHeader} style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>{category.name}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          총 {posts.length}개의 글이 있습니다.
        </p>
      </div>

      {posts.length > 0 ? (
        <PostListArea posts={posts} popularPosts={popularPosts} />
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <p>이 카테고리에 등록된 게시글이 없습니다.</p>
        </div>
      )}

      <ScrollToTop />
    </main>
  );
}
