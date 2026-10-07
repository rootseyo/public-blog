import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getBambooPostById, getBambooComments } from '../actions';
import { stripHtml } from '@/lib/bamboo-seo';
import BambooBoardClient from '../BambooBoardClient';
import { SITE_URL } from '@/lib/site-url';

export const revalidate = 0;

interface BambooDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

/**
 * URL 파라미터에서 ID와 Slug를 추출
 * 예: 582-communication-checklist -> id: 582, slug: communication-checklist
 * 예: 582 -> id: 582, slug: ""
 */
function parseParam(paramSlug: string): { id: number | null; slug: string } {
  const match = paramSlug.match(/^(\d+)(?:-(.*))?$/);
  if (!match) {
    return { id: null, slug: '' };
  }
  return {
    id: parseInt(match[1], 10),
    slug: match[2] || '',
  };
}

export async function generateMetadata({ params }: BambooDetailPageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const { id } = parseParam(rawSlug);

  if (!id) {
    return {
      title: '게시글을 찾을 수 없습니다 | Bright Notes',
    };
  }

  const post = await getBambooPostById(id);
  if (!post) {
    return {
      title: '게시글을 찾을 수 없습니다 | Bright Notes',
    };
  }

  const canonicalSlug = post.slug ? `${post.id}-${post.slug}` : `${post.id}`;
  const canonicalUrl = `${SITE_URL}/shorts/${canonicalSlug}`;

  const title = post.meta_title || post.seo_title || `익명 게시글 #${post.id} | Bright Notes`;
  const description = post.meta_description || post.summary || stripHtml(post.content).slice(0, 150);
  const keywords = post.meta_keywords && post.meta_keywords.length > 0 ? post.meta_keywords : undefined;
  const isIndexable = post.indexable !== false;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: isIndexable,
      follow: true,
    },
    openGraph: {
      title,
      description,
      type: 'article',
      url: canonicalUrl,
      siteName: 'Bright Notes',
      locale: 'ko_KR',
      images: [
        {
          url: `${SITE_URL}/bamboo-og.png`,
          width: 1200,
          height: 630,
          alt: 'Bright Notes 📝 Shorts 게시글',
        },
      ],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [`${SITE_URL}/bamboo-og.png`],
    },
  };
}

export default async function ShortsDetailPage({ params }: BambooDetailPageProps) {
  const { slug: urlSlug } = await params;
  const { id } = parseParam(urlSlug);

  if (!id) {
    notFound();
  }

  const post = await getBambooPostById(id);
  if (!post) {
    notFound();
  }

  // canonical slug와 일치하지 않으면 301 리다이렉트
  const expectedCanonicalSlug = post.slug ? `${post.id}-${post.slug}` : `${post.id}`;
  if (urlSlug !== expectedCanonicalSlug) {
    redirect(`/shorts/${expectedCanonicalSlug}`);
  }

  const comments = await getBambooComments([post.id]);
  const canonicalUrl = `${SITE_URL}/shorts/${expectedCanonicalSlug}`;
  const plainText = stripHtml(post.content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    '@id': `${canonicalUrl}#post`,
    'url': canonicalUrl,
    'headline': post.seo_title || (plainText.length > 50 ? `${plainText.substring(0, 50)}...` : plainText),
    'text': plainText,
    'datePublished': post.created_at,
    'dateModified': post.created_at,
    'author': {
      '@type': 'Person',
      'name': post.author_name || '익명',
      // 익명 게시판에는 공개 프로필이 없으므로, 작성자 식별자는 이 게시글 안에서만 사용한다.
      '@id': `${canonicalUrl}#author`,
      'url': `${canonicalUrl}#author`,
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'Bright Notes',
      'url': `${SITE_URL}/`,
    },
    'isPartOf': {
      '@type': 'WebSite',
      'name': 'Bright Notes',
      'url': `${SITE_URL}/`,
    },
    'interactionStatistic': [
      {
        '@type': 'InteractionCounter',
        'interactionType': 'https://schema.org/CommentAction',
        'userInteractionCount': comments.length,
      },
      {
        '@type': 'InteractionCounter',
        'interactionType': 'https://schema.org/LikeAction',
        'userInteractionCount': post.likes || 0,
      },
    ],
    'comment': comments.map(c => ({
      '@type': 'Comment',
      '@id': `${canonicalUrl}#comment-${c.id}`,
      'text': stripHtml(c.content),
      'author': {
        '@type': 'Person',
        'name': c.author_name || '익명',
        '@id': `${canonicalUrl}#comment-author-${c.id}`,
        'url': `${canonicalUrl}#comment-author-${c.id}`,
      },
      'dateCreated': c.created_at,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <BambooBoardClient initialPosts={[post]} initialComments={comments} singlePostView={true} />
    </>
  );
}
