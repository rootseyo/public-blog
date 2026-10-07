import Link from 'next/link';
import styles from './page.module.css';
import { query } from '@/lib/db';
import SmartImage from '@/components/SmartImage';
import PostCard from '@/components/PostCard';
import PostListArea from '@/components/PostListArea';
import SearchBar from '@/components/SearchBar';
import SocialShare from '@/components/SocialShare';
import ScrollToTop from '@/components/ScrollToTop';
import { calculateReadingTime, extractFirstImageUrl, formatDate } from '@/lib/utils';
import { isAdmin } from '@/app/(main)/admin/actions';
import { getPopularPosts } from '@/app/(main)/admin/editor/actions';
import ViewTracker from './posts/ViewTracker';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';

export const revalidate = 0;

export async function generateMetadata({ 
  searchParams 
}: { 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }> 
}): Promise<Metadata> {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : undefined;
  const type = typeof params.type === 'string' ? params.type : 'all';
  
  const posts = await getPosts(q, type);
  const featuredPost = posts[0];
  const featuredThumbnail = featuredPost ? (featuredPost.thumbnail_url || extractFirstImageUrl(featuredPost.content)) : null;

  let ogImageUrl = featuredThumbnail;
  if (ogImageUrl && ogImageUrl.startsWith('/')) {
    const parts = ogImageUrl.split('/');
    const fileName = parts.pop() || '';
    ogImageUrl = `${SITE_URL}${parts.join('/')}/${encodeURIComponent(fileName)}`;
  }

  let title = 'Bright Notes | AI, 개발, 투자 그리고 생각을 기록하는 기술 블로그';
  if (q) {
    title = `"${q}" 검색 결과 | Bright Notes`;
  }

  const desc = 'Bright Notes는 AI, 소프트웨어 개발, 투자, 리더십, 생산성 그리고 일상의 생각을 기록하는 기술 블로그입니다. 실제 경험과 실험을 바탕으로 얻은 인사이트를 공유합니다.';

  return {
    title,
    description: desc,
    alternates: {
      canonical: SITE_URL,
    },
    openGraph: {
      title,
      description: desc,
      images: ogImageUrl ? [{ url: ogImageUrl }] : [],
      type: 'website',
      siteName: 'Bright Notes',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
      images: ogImageUrl ? [ogImageUrl] : [],
    },
  };
}

interface Post {
  id: number;
  slug: string | null;
  title: string;
  content: string;
  meta_description?: string | null;
  thumbnail_url: string | null;
  views: number;
  comment_count?: number;
  published_at: Date;
  category_name?: string;
}

async function getPosts(searchQuery?: string, searchType: string = 'all'): Promise<Post[]> {
  try {
    let queryStr = `
      SELECT p.*, c.name as category_name,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
      FROM posts p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.status = 'published' AND p.published_at <= CURRENT_TIMESTAMP
    `;
    const params: any[] = [];

    if (searchQuery) {
      const searchPattern = `%${searchQuery}%`;
      params.push(searchPattern);
      
      if (searchType === 'title') {
        queryStr += ` AND p.title ILIKE $1`;
      } else if (searchType === 'content') {
        queryStr += ` AND p.content ILIKE $1`;
      } else {
        queryStr += ` AND (p.title ILIKE $1 OR p.content ILIKE $1)`;
      }
    }

    queryStr += ` ORDER BY p.published_at DESC`;
    
    const res = await query(queryStr, params);
    return res.rows;
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : undefined;
  const type = typeof params.type === 'string' ? params.type : 'all';

  const [posts, popularPosts] = await Promise.all([
    getPosts(q, type),
    getPopularPosts()
  ]);
  
  const featuredPost = posts[0];
  const listPosts = posts.slice(1);
  const featuredThumbnail = featuredPost ? (featuredPost.thumbnail_url || extractFirstImageUrl(featuredPost.content)) : null;

  // Ensure absolute image URL for JSON-LD
  let featuredImageUrl = featuredThumbnail;
  if (featuredImageUrl && featuredImageUrl.startsWith('/')) {
    const parts = featuredImageUrl.split('/');
    const fileName = parts.pop() || '';
    featuredImageUrl = `${SITE_URL}${parts.join('/')}/${encodeURIComponent(fileName)}`;
  }

  return (
    <main className={styles.main}>
      <ViewTracker path="/" />

      <SearchBar />

      {q && (
        <div style={{ padding: '0 1.5rem', marginBottom: '2rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700' }}>
            &quot;{q}&quot; 검색 결과 ({posts.length}건)
          </h2>
          <Link href="/" style={{ fontSize: '0.9rem', color: '#0070f3', marginTop: '0.5rem', display: 'inline-block' }}>
            검색 초기화
          </Link>
        </div>
      )}

      {posts.length > 0 ? (
        <>
          <PostListArea posts={posts} popularPosts={popularPosts} />
          
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Blog",
                "name": "Bright Notes",
                "description": "Bright Notes는 AI, 소프트웨어 개발, 투자, 리더십, 생산성 그리고 일상의 생각을 기록하는 기술 블로그입니다.",
                "url": SITE_URL,
                "image": featuredImageUrl ? [featuredImageUrl] : [],
                "author": {
                  "@type": "Person",
                  "name": "김세연",
                  "url": `${SITE_URL}/`
                }
              }),
            }}
          />
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <p style={{ fontSize: '1.1rem', color: '#666' }}>
            {q ? `"${q}"에 대한 검색 결과가 없습니다.` : '등록된 게시글이 없습니다.'}
          </p>
          {q && (
            <Link href="/" style={{ color: '#0070f3', marginTop: '1rem', display: 'inline-block', fontWeight: '600' }}>
              전체 게시글 보기
            </Link>
          )}
        </div>
      )}

      <section className={styles.ctaSection}>
        <h2 className={styles.ctaTitle}>든든한 실무 조력자가 필요하신가요?</h2>
        <p className={styles.ctaDescription}>
          당장 실행에 옮길 믿음직한 손길이 부족하시다면 연락주세요.
        </p>
        <Link href="/collaboration" className={styles.ctaButton}>
          협업 제안하기
        </Link>
      </section>

      <ScrollToTop />
    </main>
  );
}
