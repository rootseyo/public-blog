'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

interface SidebarProps {
  popularPosts: any[];
}

export default function Sidebar({ popularPosts }: SidebarProps) {
  const pathname = usePathname();
  const isAdminPage = pathname?.startsWith('/admin');
  const isLensPage = pathname?.startsWith('/lens/');

  if (isAdminPage || isLensPage || !popularPosts || popularPosts.length === 0) return null;

  return (
    <aside className={styles.sidebar} data-nosnippet>
      <div className={styles.section}>
        <p className={styles.title}>인기글 Top 10</p>
        <ul className={styles.list}>
          {popularPosts.map((post, index) => (
            <li key={post.id} className={styles.item}>
              <Link href={`/posts/${post.slug || post.id}`} className={styles.link}>
                <span className={styles.rank}>{index + 1}</span>
                <span className={styles.postTitle}>{post.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      
    </aside>
  );
}
