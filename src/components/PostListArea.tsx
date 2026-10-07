'use client';

import { useState } from 'react';
import PostCard from './PostCard';
import styles from '@/app/(main)/page.module.css';
import { ChevronDown, Trophy } from 'lucide-react';
import Link from 'next/link';

interface PostListAreaProps {
  posts: any[];
  popularPosts?: any[];
}

export default function PostListArea({ posts, popularPosts = [] }: PostListAreaProps) {
  const [isPopularExpanded, setIsPopularExpanded] = useState(false);

  if (!posts || posts.length === 0) return null;

  return (
    <div className={styles.compactPadding}>
      {/* Mobile Popular Posts Accordion */}
      {popularPosts.length > 0 && (
        <div className={styles.mobilePopularAccordion}>
          <button 
            className={styles.popularAccordionTrigger}
            onClick={() => setIsPopularExpanded(!isPopularExpanded)}
          >
            <div className={styles.popularTriggerLabel}>
              <Trophy size={16} className={styles.trophyIcon} />
              <span>실시간 인기글 Top 10</span>
            </div>
            <ChevronDown 
              size={18} 
              style={{ 
                transform: isPopularExpanded ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.3s ease'
              }} 
            />
          </button>
          <div className={`${styles.popularAccordionContent} ${isPopularExpanded ? styles.expanded : ''}`}>
            <ul className={styles.popularAccordionList}>
              {popularPosts.map((post, index) => (
                <li key={post.id} className={styles.popularAccordionItem}>
                  <Link href={`/posts/${post.slug || post.id}`} className={styles.popularAccordionLink}>
                    <span className={styles.popularRank}>{index + 1}</span>
                    <span className={styles.popularPostTitle}>{post.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className={styles.listGrid}>
        {posts.map((post, index) => (
          <PostCard 
            key={post.id} 
            post={post} 
            viewMode="list" 
            priority={index < 4} // First 4 items in list are usually above fold
            isFirst={index === 0}
          />
        ))}
      </section>
    </div>
  );
}
