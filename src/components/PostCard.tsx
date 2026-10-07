import Link from 'next/link';
import styles from '@/app/(main)/page.module.css';
import SmartImage from './SmartImage';
import { calculateReadingTime, extractFirstImageUrl, formatRelativeTime } from '@/lib/utils';
import { Calendar, Eye, Clock, Tag, MessageSquare } from 'lucide-react';

interface Post {
  id: number;
  slug: string;
  title: string;
  content: string;
  meta_description?: string | null;
  thumbnail_url: string | null;
  views: number;
  comment_count?: number;
  created_at?: Date | string;
  published_at?: Date | string;
  category_name?: string;
}

export default function PostCard({ 
  post, 
  viewMode = 'card', 
  priority = false,
  isFirst = false 
}: { 
  post: Post, 
  viewMode?: 'card' | 'list', 
  priority?: boolean,
  isFirst?: boolean
}) {
  const readTime = calculateReadingTime(post.content || '');
  const displayThumbnail = post.thumbnail_url || extractFirstImageUrl(post.content || '');
  const displayDate = formatRelativeTime(post.published_at || post.created_at);

  if (viewMode === 'list') {
    return (
      <Link href={`/posts/${post.slug || post.id}`} className={styles.postListRow}>
        {displayThumbnail && (
          <div className={styles.listThumbnailWrapper}>
            <SmartImage 
              src={displayThumbnail} 
              alt={post.title}
              className={styles.listThumbnail}
              priority={priority}
            />
          </div>
        )}
        <div className={styles.listContent}>
          <p className={styles.listTitle}>{post.title}</p>
          
          {(post.meta_description || post.content) && (
            <p className={styles.listDescription}>
              {post.meta_description || post.content.replace(/<[^>]*>?/gm, '').substring(0, 120)}
            </p>
          )}

          <div className={styles.tileMeta}>
            <span className={styles.metaItem}>
              <Calendar size={14} />
              {displayDate}
            </span>
            <span className={styles.metaItem}>
              <Eye size={14} />
              {post.views || 0}
            </span>
            <span className={styles.metaItem}>
              <MessageSquare size={14} />
              {post.comment_count || 0}
            </span>
            {post.category_name && (
              <div className={styles.categoryWrapper}>
                <div className={`${styles.badgeV2} ${styles.badgeSuccess}`}>
                  <Tag size={12} />
                  <span>{post.category_name}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/posts/${post.slug || post.id}`} className={styles.postTile}>
      {displayThumbnail && (
        <SmartImage 
          src={displayThumbnail} 
          alt={post.title}
          className={styles.tileImage}
          priority={priority}
        />
      )}
      <div className={styles.tileContent}>
        <p className={styles.tileTitle}>{post.title}</p>
        <div className={styles.tileMeta}>
          <span className={styles.metaItem}>
            <Calendar size={14} />
            {displayDate}
          </span>
          <span className={styles.metaItem}>
            <Clock size={14} />
            {readTime}분
          </span>
          <span className={styles.metaItem}>
            <Eye size={14} />
            {post.views || 0}
          </span>
          <span className={styles.metaItem}>
            <MessageSquare size={14} />
            {post.comment_count || 0}
          </span>
          {post.category_name && (
            <div className={styles.categoryWrapper}>
              <div className={`${styles.badgeV2} ${styles.badgeSuccess}`}>
                <Tag size={12} />
                <span>{post.category_name}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
