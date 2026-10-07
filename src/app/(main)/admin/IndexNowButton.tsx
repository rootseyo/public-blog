'use client';

import { useState } from 'react';
import { triggerIndexNow } from './actions';
import styles from './admin.module.css';

export default function IndexNowButton() {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleClick = async () => {
    if (!confirm('전송 대기 중인 변경 URL을 Bing IndexNow에 전송하시겠습니까?')) return;
    
    setIsPending(true);
    setMessage(null);
    
    try {
      const result = await triggerIndexNow();
      if ('deferred' in result && result.deferred) {
        setMessage({ text: result.message || 'Bing 전송 재시도 대기 중입니다.', type: 'success' });
      } else if (result.success) {
        const message = 'message' in result ? result.message : undefined;
        setMessage({ text: message || 'Bing IndexNow 전송이 완료되었습니다.', type: 'success' });
      } else {
        setMessage({ text: `전송 실패: ${result.error || '알 수 없는 오류'}`, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: '전송 중 예외가 발생했습니다.', type: 'error' });
    } finally {
      setIsPending(false);
      // 3초 후 메시지 제거
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      {message && (
        <span style={{ 
          fontSize: '0.85rem', 
          color: message.type === 'success' ? '#10b981' : '#ef4444',
          fontWeight: '600'
        }}>
          {message.text}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        className={styles.logoutButton}
        style={{ 
          borderColor: '#0070f3', 
          color: '#0070f3',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        {isPending ? (
          <>
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
            전송 중...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            대기 URL 전송
          </>
        )}
      </button>
    </div>
  );
}
