import styles from '../admin.module.css';
import { isAdmin } from '../actions';
import { redirect } from 'next/navigation';
import { getAllComments } from '../actions';
import Link from 'next/link';
import CommentActionButton from './CommentActionButton';

export default async function CommentManagement() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  const comments = await getAllComments();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>댓글 관리</h1>
      </header>
      
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>작성자</th>
              <th>내용</th>
              <th>게시글</th>
              <th>날짜</th>
              <th>신고</th>
              <th>좋아요</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {comments.map((comment: any) => (
              <tr key={comment.id} style={comment.deleted_at ? { backgroundColor: 'var(--secondary-bg)', opacity: 0.7 } : {}}>
                <td data-label="ID">{comment.id}</td>
                <td data-label="작성자">{comment.author_name}</td>
                <td data-label="내용">
                  <div style={{ 
                    maxWidth: '300px', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    fontSize: '0.8rem'
                  }} title={comment.content}>
                    {comment.content}
                  </div>
                </td>
                <td data-label="게시글">
                  <Link href={`/posts/${comment.post_slug}`} className={styles.postLink} style={{ fontSize: '0.8rem' }}>
                    {comment.post_title}
                  </Link>
                </td>
                <td data-label="날짜" style={{ fontSize: '0.75rem' }}>
                  {new Date(comment.created_at).toISOString().split('T')[0]}
                </td>
                <td data-label="신고">
                  <span style={{ color: comment.reports > 0 ? '#e53e3e' : 'inherit', fontWeight: comment.reports > 0 ? '700' : 'normal' }}>
                    {comment.reports}
                  </span>
                </td>
                <td data-label="좋아요">
                  <span>👍 {comment.likes || 0}</span>
                </td>
                <td data-label="상태">
                  <span className={`${styles.statusBadge} ${comment.deleted_at ? styles.deleted : styles.published}`}>
                    {comment.deleted_at ? '삭제됨' : '정상'}
                  </span>
                </td>
                <td data-label="관리">
                  <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                    <CommentActionButton id={comment.id} isDeleted={!!comment.deleted_at} type="toggle" />
                    <CommentActionButton id={comment.id} isDeleted={!!comment.deleted_at} type="permanent" />
                  </div>
                </td>
              </tr>
            ))}
            {comments.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                  댓글이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
