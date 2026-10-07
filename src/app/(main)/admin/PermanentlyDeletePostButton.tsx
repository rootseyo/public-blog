'use client';

import { useState } from 'react';
import { permanentlyDeletePost } from './actions';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';

export default function PermanentlyDeletePostButton({ id, title }: { id: number; title: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm(`"${title}" 글을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 데이터가 즉시 삭제됩니다.`)) {
      return;
    }

    setLoading(true);
    const result = await permanentlyDeletePost(id);
    
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || '영구 삭제 실패');
    }
    setLoading(false);
  };

  return (
    <button 
      onClick={handleDelete} 
      disabled={loading}
      className={styles.logoutButton}
      style={{ 
        marginLeft: '0.5rem', 
        color: 'white', 
        backgroundColor: '#e53e3e',
        borderColor: '#c53030',
        padding: '0.25rem 0.5rem',
        fontSize: '0.75rem'
      }}
    >
      {loading ? '...' : '영구 삭제'}
    </button>
  );
}
