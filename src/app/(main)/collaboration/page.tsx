'use client';

import { useState } from 'react';
import { sendSlackInquiry } from './actions';
import Link from 'next/link';
import styles from './collaboration.module.css';

export default function CollaborationPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const result = await sendSlackInquiry(formData);

    if (result.success) {
      setSubmitted(true);
    } else {
      setError(result.error || '전송에 실패했습니다.');
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className={styles.successContainer}>
        <h1 className={styles.title}>감사합니다.</h1>
        <p className={styles.subtitle}>
          문의가 정상적으로 접수되었습니다.<br />
          확인 후 남겨주신 이메일로 빠르게 답변드리겠습니다.
        </p>
        <Link href="/" className={styles.homeButton}>
          돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          실무 조력이 필요하신가요?
        </h1>
        <p className={styles.subtitle}>
          정교한 실행으로 그 발걸음에 힘을 보태겠습니다.
        </p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label className={styles.label}>이름 *</label>
          <input 
            name="name" 
            type="text" 
            required 
            placeholder="성함을 입력해주세요" 
            className={styles.input} 
          />
        </div>
        
        <div className={styles.formGroup}>
          <label className={styles.label}>회사명 *</label>
          <input 
            name="company" 
            type="text" 
            required 
            placeholder="소속 회사 혹은 단체명" 
            className={styles.input} 
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>이메일 *</label>
          <input 
            name="email" 
            type="email" 
            required 
            placeholder="연락받으실 이메일 주소" 
            className={styles.input} 
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>문의 내용 *</label>
          <textarea 
            name="content" 
            required 
            placeholder="일손이 필요한 부분이나 협업에 대해 자유롭게 적어주세요" 
            className={styles.textarea} 
          />
        </div>

        <div className={styles.agreementWrapper}>
          <input 
            id="agreement" 
            name="agreement"
            type="checkbox" 
            required 
            className={styles.checkbox} 
          />
          <label htmlFor="agreement" className={styles.agreementLabel}>
            개인정보 수집 및 이용에 동의합니다. * (문의 응대 및 협업 제안 확인 목적)
          </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button 
          type="submit" 
          disabled={loading}
          className={styles.submitButton}
          style={{ 
            backgroundColor: loading ? '#ccc' : '#0070f3',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '전송 중...' : '문의하기'}
        </button>
      </form>
    </div>
  );
}
