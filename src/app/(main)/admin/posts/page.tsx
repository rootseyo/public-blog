import Link from 'next/link';
import { query } from '@/lib/db';
import { isAdmin } from '../actions';
import { redirect } from 'next/navigation';
import styles from '../admin.module.css';
import DeletePostButton from '../DeletePostButton';
import PermanentlyDeletePostButton from '../PermanentlyDeletePostButton';
import { extractFirstImageUrl } from '@/lib/utils';
import SmartImage from '@/components/SmartImage';

export default async function PostManagement() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  const postsRes = await query(`
    SELECT p.id, p.title, p.slug, p.views, p.published_at, p.created_at, p.status, p.thumbnail_url, p.content, c.name as category_name 
    FROM posts p 
    LEFT JOIN categories c ON p.category_id = c.id 
    ORDER BY p.published_at DESC, p.created_at DESC
  `);
  const posts = postsRes.rows;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>게시글 관리 (총 {posts.length}개)</h1>
        <Link href="/admin/editor" className={styles.createButton}>
          새 글 쓰기
        </Link>
      </header>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>번호</th>
              <th>ID</th>
              <th>제목</th>
              <th>카테고리</th>
              <th>날짜</th>
              <th>조회수</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post: any, index: number) => {
              const displayThumbnail = post.thumbnail_url || extractFirstImageUrl(post.content);
              return (
                <tr key={post.id}>
                  <td data-label="번호">{posts.length - index}</td>
                  <td data-label="ID">{post.id}</td>
                  <td data-label="제목" style={post.status === 'deleted' ? { textDecoration: 'line-through', color: '#999' } : {}}>
                    <div className={styles.adminTitleCell}>
                      {displayThumbnail && (
                        <SmartImage src={displayThumbnail} alt={post.title} className={styles.adminThumbnail} />
                      )}
                      <Link href={`/posts/${post.slug || post.id}`} className={styles.postLink}>
                        {post.title}
                        {post.status === 'published' && new Date(post.published_at) > new Date() && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', backgroundColor: '#fef3c7', color: '#92400e', padding: '0.1rem 0.4rem', borderRadius: '4px', verticalAlign: 'middle' }}>예약됨</span>
                        )}
                      </Link>
                    </div>
                  </td>
                  <td data-label="카테고리">
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>
                      {post.category_name || '-'}
                    </span>
                  </td>
                  <td data-label="날짜">{new Date(post.published_at || post.created_at).toISOString().split('T')[0]}</td>
                  <td data-label="조회수">{post.views}</td>
                  <td data-label="상태">
                    <span className={`${styles.statusBadge} ${
                      post.status === 'published' ? styles.published : 
                      post.status === 'draft' ? styles.draft : styles.deleted
                    }`}>
                      {post.status}
                    </span>
                  </td>
                  <td data-label="관리">
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <Link href={`/admin/editor?id=${post.id}`} className={styles.editButton}>
                        수정
                      </Link>
                      {post.status !== 'deleted' ? (
                        <DeletePostButton id={post.id} title={post.title} />
                      ) : (
                        <PermanentlyDeletePostButton id={post.id} title={post.title} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
