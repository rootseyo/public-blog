import { Metadata } from 'next';
import { getBambooPosts, getBambooComments } from './actions';
import BambooBoardClient from './BambooBoardClient';
import { SITE_URL } from '@/lib/site-url';

export const revalidate = 0; // Disable server caching for dynamic feeds

const title = '직장인의 익명 이야기와 짧은 생각 | Bright Notes Shorts';
const description = '직장인들이 회사생활, 조직문화, 리더십, 커뮤니케이션과 커리어에 관한 생각을 익명으로 나누는 Bright Notes Shorts 게시판입니다.';

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: `${SITE_URL}/shorts`,
  },
  openGraph: {
    title,
    description,
    type: 'website',
    url: `${SITE_URL}/shorts`,
    images: [
      {
        url: `${SITE_URL}/bamboo-og.png`,
        width: 1200,
        height: 630,
        alt: '📝 Shorts',
      },
      {
        url: `${SITE_URL}/bamboo.svg`,
        width: 800,
        height: 600,
        alt: '📝 Shorts Vector',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [`${SITE_URL}/bamboo-og.png`],
  },
};

export default async function ShortsPage() {
  const posts = await getBambooPosts();
  const postIds = posts.map(p => p.id);
  const comments = await getBambooComments(postIds);

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Bright Notes | 📝 Shorts',
    'description': '직장인들이 회사생활, 조직문화, 리더십, 커뮤니케이션과 커리어에 관한 생각을 익명으로 나누는 게시판입니다.',
    'url': `${SITE_URL}/shorts`,
    'mainEntity': {
      '@type': 'ItemList',
      'numberOfItems': posts.length,
      'itemListElement': posts.map((post, idx) => {
        const postUrl = `${SITE_URL}/shorts/${post.id}${post.slug ? '-' + post.slug : ''}`;
        const plainContent = post.content.replace(/<[^>]*>?/gm, '');
        return {
          '@type': 'ListItem',
          'position': idx + 1,
          'item': {
            '@type': 'DiscussionForumPosting',
            '@id': `${postUrl}#post`,
            'url': postUrl,
            'headline': post.seo_title || (plainContent.length > 50 ? `${plainContent.substring(0, 50)}...` : plainContent),
            'datePublished': post.created_at,
            'author': {
              '@type': 'Person',
              'name': post.author_name || '익명',
              // 개별 글의 구조화 데이터와 같은 작성자 식별자를 사용한다.
              '@id': `${postUrl}#author`,
              'url': `${postUrl}#author`,
            },
          },
        };
      }),
    },
  };
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(collectionJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <BambooBoardClient initialPosts={posts} initialComments={comments} />
    </>
  );
}
