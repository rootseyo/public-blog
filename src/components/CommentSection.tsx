'use client';

import { useState, useEffect } from 'react';
import styles from './CommentSection.module.css';
import { addComment, deleteComment, updateComment, reportComment, getCommentContent, likeComment } from '@/app/(main)/posts/actions';
import { ThumbsUp } from 'lucide-react';

/** URL을 자동으로 클릭 가능한 링크로 변환 */
function linkifyContent(text: string) {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ color: '#0070f3', wordBreak: 'break-all' }}>
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

interface Comment {
  id: number;
  author_name: string;
  content: string;
  is_admin: boolean;
  is_private: boolean;
  created_at: string;
  reports?: number;
  likes?: number;
}

interface CommentSectionProps {
  postId: number;
  initialComments: Comment[];
  isAdminView?: boolean;
}

export default function CommentSection({ postId, initialComments, isAdminView = false }: CommentSectionProps) {
  const [comments, setComments] = useState(initialComments);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [myCommentIds, setMyCommentIds] = useState<number[]>([]);

  const [likedComments, setLikedComments] = useState<number[]>([]);

  useEffect(() => {
    setMounted(true);
    // 로컬 스토리지에서 내 댓글 ID 목록 가져오기
    const saved = localStorage.getItem(`my_comments_${postId}`);
    if (saved) {
      try {
        setMyCommentIds(JSON.parse(saved).map((c: any) => c.id));
      } catch (e) {
        console.error('Failed to parse my comments', e);
      }
    }

    // 로컬 스토리지에서 좋아요 누른 댓글 ID 목록 가져오기
    const savedLikes = localStorage.getItem('liked_comments');
    if (savedLikes) {
      try {
        setLikedComments(JSON.parse(savedLikes));
      } catch (e) {
        console.error('Failed to parse liked comments', e);
      }
    }
  }, [postId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const password = formData.get('password') as string;
    
    const res = await addComment(postId, formData);

    if (res.success && res.id) {
      // 로컬 스토리지에 저장
      const saved = localStorage.getItem(`my_comments_${postId}`);
      const myComments = saved ? JSON.parse(saved) : [];
      myComments.push({ id: res.id, password }); // 비밀번호도 저장해두면 수정/삭제 시 편리함
      localStorage.setItem(`my_comments_${postId}`, JSON.stringify(myComments));
      
      form.reset();
      window.location.reload();
    } else {
      alert(res.error || '댓글 작성에 실패했습니다.');
    }
    setIsSubmitting(false);
  }

  async function handleEdit(comment: Comment) {
    if (editingId === comment.id) {
      setEditingId(null);
      setEditContent('');
      return;
    }

    let content = comment.content;
    if (comment.is_private && content === '비밀 댓글입니다.') {
      const saved = localStorage.getItem(`my_comments_${postId}`);
      const myComments = saved ? JSON.parse(saved) : [];
      const myComment = myComments.find((c: any) => c.id === comment.id);
      
      const res = await getCommentContent(comment.id, myComment?.password);
      if (res.success) {
        content = res.content || '';
      } else {
        const pass = prompt('비밀 댓글의 내용을 보려면 비밀번호를 입력하세요.');
        if (!pass) return;
        const res2 = await getCommentContent(comment.id, pass);
        if (res2.success) {
          content = res2.content || '';
        } else {
          alert(res2.error);
          return;
        }
      }
    }

    setEditContent(content);
    setEditingId(comment.id);
  }

  async function handleUpdate(id: number, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // 로컬 스토리지에서 비밀번호 자동 시도
    if (!formData.get('password')) {
      const saved = localStorage.getItem(`my_comments_${postId}`);
      const myComments = saved ? JSON.parse(saved) : [];
      const myComment = myComments.find((c: any) => c.id === id);
      if (myComment) formData.append('password', myComment.password);
      else {
        const pass = prompt('비밀번호를 입력하세요.');
        if (!pass) return;
        formData.append('password', pass);
      }
    }

    const res = await updateComment(id, formData);
    if (res.success) {
      setEditingId(null);
      window.location.reload();
    } else {
      alert(res.error);
    }
  }

  async function handleDelete(id: number) {
    if (isAdminView) {
      if (!confirm('정말 이 댓글을 삭제하시겠습니까? (관리자 권한)')) return;
      const res = await deleteComment(id, undefined, true);
      if (res.success) window.location.reload();
      return;
    }

    let password = '';
    const saved = localStorage.getItem(`my_comments_${postId}`);
    const myComments = saved ? JSON.parse(saved) : [];
    const myComment = myComments.find((c: any) => c.id === id);
    
    if (myComment) {
      if (!confirm('정말 삭제하시겠습니까?')) return;
      password = myComment.password;
    } else {
      const pass = prompt('댓글을 삭제하려면 비밀번호를 입력하세요.');
      if (!pass) return;
      password = pass;
    }

    const res = await deleteComment(id, password);
    if (res.success) {
      // 로컬 스토리지에서도 삭제
      const newMyComments = myComments.filter((c: any) => c.id !== id);
      localStorage.setItem(`my_comments_${postId}`, JSON.stringify(newMyComments));
      window.location.reload();
    } else {
      alert(res.error);
    }
  }

  async function handleReport(id: number) {
    if (!confirm('부적절한 내용으로 신고하시겠습니까?')) return;
    const res = await reportComment(id);
    if (res.success) {
      alert('신고가 접수되었습니다.');
      window.location.reload();
    }
  }

  async function handleLike(id: number) {
    if (likedComments.includes(id)) {
      alert('이미 좋아요를 누른 댓글입니다.');
      return;
    }

    const res = await likeComment(id);
    if (res.success) {
      const newLikes = [...likedComments, id];
      setLikedComments(newLikes);
      localStorage.setItem('liked_comments', JSON.stringify(newLikes));
      
      setComments(prev => prev.map(c => c.id === id ? { ...c, likes: (c.likes || 0) + 1 } : c));
    } else {
      alert(res.error || '좋아요 처리에 실패했습니다.');
    }
  }

  return (
    <div className={styles.commentSection} data-nosnippet>
      <p className={styles.commentTitle}>댓글 ({comments.length})</p>

      <ul className={styles.commentList}>
        {comments.map((comment) => (
          <li key={comment.id} className={styles.commentItem}>
            <div className={styles.commentHeader}>
              <div>
                <span className={styles.author}>
                  {comment.author_name}
                  {myCommentIds.includes(comment.id) && <small style={{marginLeft: '4px', color: '#0070f3'}}>(내 댓글)</small>}
                </span>
                {comment.is_admin && <span className={styles.adminBadge}>관리자</span>}
                {comment.is_private && <span className={styles.privateBadge}>🔒 비밀 댓글</span>}
                <span className={styles.date}>
                  {mounted ? new Date(comment.created_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) : ''}
                </span>
                {isAdminView && comment.reports && comment.reports > 0 && (
                  <span style={{color: 'red', fontSize: '0.8rem', marginLeft: '10px'}}>🚩 {comment.reports}</span>
                )}
              </div>
              <div className={styles.actionButtons}>
                {!isAdminView && !myCommentIds.includes(comment.id) && (
                  <button onClick={() => handleReport(comment.id)} className={styles.reportBtn}>신고</button>
                )}
                {(myCommentIds.includes(comment.id) || isAdminView) && (
                  <>
                    <button onClick={() => handleEdit(comment)} className={styles.editBtn}>
                      {editingId === comment.id ? '취소' : '수정'}
                    </button>
                    <button onClick={() => handleDelete(comment.id)} className={styles.deleteBtn}>삭제</button>
                  </>
                )}
              </div>
            </div>

            {editingId === comment.id ? (
              <form onSubmit={(e) => handleUpdate(comment.id, e)} className={styles.editForm}>
                <textarea name="content" defaultValue={editContent} required className={styles.textarea} />
                <button type="submit" className={styles.submitBtn}>저장</button>
              </form>
            ) : (
              <>
                <div className={styles.content}>{linkifyContent(comment.content)}</div>
                <div className={styles.commentFooter}>
                  <button 
                    onClick={() => handleLike(comment.id)} 
                    className={`${styles.likeBtn} ${likedComments.includes(comment.id) ? styles.liked : ''}`}
                    title="댓글 좋아요"
                  >
                    <ThumbsUp size={13} />
                    <span>좋아요 {comment.likes || 0}</span>
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className={styles.commentForm}>
        <div className={styles.formGrid}>
          <input type="text" name="authorName" placeholder="이름" required maxLength={20} className={styles.input} />
          <input type="password" name="password" placeholder="비밀번호" required className={styles.input} />
          <label className={styles.checkboxLabel}>
            <input type="checkbox" name="isPrivate" value="true" />
            <span>비밀 댓글</span>
          </label>
        </div>
        <textarea name="content" placeholder="댓글 내용을 입력하세요..." required maxLength={1000} className={styles.textarea} />
        <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
          {isSubmitting ? '작성 중...' : '댓글 등록'}
        </button>
      </form>
    </div>
  );
}
