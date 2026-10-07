'use client';

import { useState } from 'react';
import { deletePost } from './actions';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';

export default function DeletePostButton({ id, title }: { id: number; title: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm(`"${title}" 글을 삭제하시겠습니까?\n삭제된 글은 15일 동안 보관 후 영구 삭제됩니다.`)) {
      return;
    }

    setLoading(true);
    const result = await deletePost(id);
    
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || '삭제 실패');
    }
    setLoading(false);
  };

  return (
    <button 
      onClick={handleDelete} 
      disabled={loading}
      className={styles.logoutButton} // Reuse styling or add specific one
      style={{ 
        marginLeft: '0.5rem', 
        color: '#e53e3e', 
        borderColor: '#feb2b2',
        padding: '0.25rem 0.5rem',
        fontSize: '0.75rem'
      }}
    >
      {loading ? '...' : '삭제'}
    </button>
  );
}
