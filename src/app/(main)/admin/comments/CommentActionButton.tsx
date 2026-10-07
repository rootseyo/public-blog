'use client';

import { useState } from 'react';
import { toggleCommentDelete, permanentlyDeleteComment } from '../actions';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';

interface CommentActionButtonProps {
  id: number;
  isDeleted: boolean;
  type: 'toggle' | 'permanent';
}

export default function CommentActionButton({ id, isDeleted, type }: CommentActionButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAction = async () => {
    if (type === 'toggle') {
      const actionText = isDeleted ? '복구' : '삭제';
      if (!confirm(`이 댓글을 ${actionText}하시겠습니까?`)) return;

      setLoading(true);
      const result = await toggleCommentDelete(id, isDeleted);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    } else {
      if (!confirm('이 댓글을 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

      setLoading(true);
      const result = await permanentlyDeleteComment(id);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    }
    setLoading(false);
  };

  return (
    <button 
      onClick={handleAction} 
      disabled={loading}
      className={styles.editButton}
      style={{ 
        color: type === 'permanent' ? '#e53e3e' : (isDeleted ? '#38a169' : '#e53e3e'),
        borderColor: type === 'permanent' ? '#feb2b2' : (isDeleted ? '#9ae6b4' : '#feb2b2'),
        padding: '0.25rem 0.5rem',
        fontSize: '0.75rem',
        minWidth: '3rem'
      }}
    >
      {loading ? '...' : (type === 'permanent' ? '영구삭제' : (isDeleted ? '복구' : '삭제'))}
    </button>
  );
}
