import { getPostBySlug } from '@/app/(main)/admin/editor/actions';
import { query as dbQuery } from '@/lib/db';
import styles from './post.module.css';
import mainStyles from '@/app/(main)/page.module.css';
import { notFound } from 'next/navigation';
import SmartImage from '@/components/SmartImage';
import PostCard from '@/components/PostCard';
import SocialShare from '@/components/SocialShare';
import Link from 'next/link';
import { Metadata } from 'next';
import { calculateReadingTime, extractFirstImageUrl, formatDate, safeDateISO } from '@/lib/utils';
import ViewTracker from '../ViewTracker';
import { isAdmin } from '@/app/(main)/admin/actions';
import LikeButton from '@/components/LikeButton';
import PostContent from './PostContent';
import { getComments } from '../actions';
import CommentSection from '@/components/CommentSection';
import { SITE_URL } from '@/lib/site-url';

export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string }>;
}

const BASE_URL = SITE_URL;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const post = await getPostBySlug(decodedSlug);
  const admin = await isAdmin();

  if (!post || post.status === 'deleted' || (post.status === 'draft' && !admin)) return { title: 'Post Not Found' };

  // URL Encode the slug for canonical tag only if it contains non-ASCII characters
  const isAscii = /^[\x00-\x7F]*$/.test(post.slug);
  const finalSlug = isAscii ? post.slug : encodeURIComponent(post.slug);
  const canonicalUrl = `${BASE_URL}/posts/${finalSlug}`;

  // Ensure absolute image URL for OG tags
  let ogImageUrl = post.thumbnail_url || extractFirstImageUrl(post.content);
  if (ogImageUrl && ogImageUrl.startsWith('/')) {
    // 파일명에 한글이 포함된 경우를 대비해 URL 인코딩 처리
    const parts = ogImageUrl.split('/');
    const fileName = parts.pop() || '';
    ogImageUrl = `${BASE_URL}${parts.join('/')}/${encodeURIComponent(fileName)}`;
  }

  const originalTitle = post.meta_title || post.title;
  // 짧은 고유 제목도 검색 결과에서 주제와 사이트를 함께 전달하도록 보완한다.
  const metaTitle = originalTitle.length < 30
    ? `${originalTitle} | 실무 경험과 인사이트 | Bright Notes`
    : originalTitle;
  const metaDescription = post.meta_description || post.content.replace(/<[^>]*>?/gm, '').substring(0, 160);
  const metaKeywords = post.meta_keywords ? post.meta_keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : undefined;

  return {
    metadataBase: new URL(BASE_URL),
    title: metaTitle,
    description: metaDescription,
    keywords: metaKeywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: post.og_title || metaTitle,
      description: post.og_description || metaDescription,
      url: canonicalUrl,
      images: ogImageUrl ? [{ url: ogImageUrl }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.og_title || metaTitle,
      description: post.og_description || metaDescription,
      images: ogImageUrl ? [ogImageUrl] : [],
    },
  };
}

export default async function PostDetail(props: Props) {
  const params = await props.params;
  const slug = params.slug;
  const decodedSlug = decodeURIComponent(slug);
  
  const post = await getPostBySlug(decodedSlug);
  const admin = await isAdmin();

  if (!post || post.status === 'deleted' || (post.status === 'draft' && !admin)) {
    notFound();
  }

  // Check scheduled publishing: if published_at is in the future and not admin, return notFound
  if (post.status === 'published' && new Date(post.published_at) > new Date() && !admin) {
    notFound();
  }

  const relatedRes = await dbQuery(
    `SELECT p.id, p.slug, p.title, p.content, p.meta_description, p.thumbnail_url, p.views, p.published_at, c.name as category_name,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
     FROM posts p 
     LEFT JOIN categories c ON p.category_id = c.id 
     WHERE p.id != $1 AND p.status = 'published' AND p.published_at <= CURRENT_TIMESTAMP 
     ORDER BY p.published_at DESC LIMIT 4`,
    [post.id]
  );
  const relatedPosts = relatedRes.rows;

  const isAscii = /^[\x00-\x7F]*$/.test(post.slug);
  const finalSlug = isAscii ? post.slug : encodeURIComponent(post.slug);
  const canonicalUrl = `${BASE_URL}/posts/${finalSlug}`;

  // Ensure absolute image URL for SocialShare
  let shareImageUrl = post.thumbnail_url || extractFirstImageUrl(post.content);
  if (shareImageUrl && shareImageUrl.startsWith('/')) {
    // 파일명에 한글이 포함된 경우를 대비해 URL 인코딩 처리
    const parts = shareImageUrl.split('/');
    const fileName = parts.pop() || '';
    shareImageUrl = `${BASE_URL}${parts.join('/')}/${encodeURIComponent(fileName)}`;
  }

  const metaDescription = post.meta_description || post.content.replace(/<[^>]*>?/gm, '').substring(0, 160);

  // JSON-LD Structured Data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.meta_title || post.title,
    description: metaDescription,
    keywords: post.meta_keywords || undefined,
    image: shareImageUrl ? [shareImageUrl] : [],
    url: canonicalUrl,
    datePublished: safeDateISO(post.published_at || post.created_at),
    dateModified: safeDateISO(post.updated_at || post.published_at || post.created_at),
    author: [{
      '@type': 'Person',
      name: '김세연',
      url: BASE_URL,
    }],
  };

  const comments = await getComments(post.id);

  return (
    <div className={styles.container}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ViewTracker postId={post.id} path={`/posts/${post.slug || post.id}`} />
      <Link href="/" className={styles.backLink}>
        ← 목록으로 돌아가기
      </Link>

      <article>
        {admin && (
          <div className={styles.adminTools}>
            <Link href={`/admin/editor?id=${post.id}`} className={styles.editButton}>
              글 수정
            </Link>
          </div>
        )}
        <header className={styles.header}>
          {post.category_name && (
            <div className={styles.categoryBadge}>
              {post.category_name}
            </div>
          )}
          <div className={mainStyles.featuredMeta} style={{ justifyContent: 'center' }}>
            <span>{formatDate(post.published_at || post.created_at)}</span>
            <span> • {calculateReadingTime(post.content)}분 읽기</span>
            <span> • 👀 {post.views || 0}</span>
          </div>
          
          <div className={styles.titleContainer}>
            <h1 className={styles.title}>{post.title}</h1>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
            <SocialShare 
              title={post.meta_title || post.title} 
              description={metaDescription}
              url={canonicalUrl}
              image={shareImageUrl || undefined}
            />
          </div>
        </header>

        <PostContent content={post.content} title={post.title} />
      </article>

      <LikeButton postId={post.id} initialLikes={post.likes || 0} />

      <CommentSection 
        postId={post.id} 
        initialComments={comments} 
        isAdminView={admin}
      />

      <div className={styles.ctaSection} data-nosnippet>
        <p className={styles.ctaTitle}>든든한 실무 조력자가 필요하신가요?</p>
        <p className={styles.ctaDescription}>
          당장 실행에 옮길 믿음직한 손길이 부족하시다면 연락주세요.
        </p>
        <Link href="/collaboration" className={styles.ctaButton}>
          협업 제안하기
        </Link>
      </div>

      {relatedPosts.length > 0 && (
        <section className={styles.relatedSection} data-nosnippet>
          <div className={styles.relatedTitle}>다른 글 읽어보기</div>
          <div className={styles.relatedGrid}>
            {relatedPosts.map((p: any) => (
              <PostCard key={p.id} post={p as any} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
