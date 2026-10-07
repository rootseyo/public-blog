'use client';

import { useMemo } from 'react';
import styles from './SocialShare.module.css';
import { getPublicImageUrl } from '@/lib/utils';

interface SocialShareProps {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
}

declare global {
  interface Window {
    Kakao: any;
  }
}

export default function SocialShare({ title, description, url, image }: SocialShareProps) {
  const shareTitle = title || "Bright Notes";
  const shareDescription = description || "Bright Notes는 AI, 소프트웨어 개발, 투자, 리더십, 생산성 그리고 일상의 생각을 기록하는 기술 블로그입니다.";

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : (process.env.SITE_URL || 'http://localhost:3000');
  
  const shareUrl = useMemo(() => {
    if (!url) return typeof window !== 'undefined' ? window.location.href : '';
    if (url.startsWith('/')) return `${currentOrigin}${url}`;
    return url;
  }, [url, currentOrigin]);

  const shareImage = useMemo(() => {
    if (!image) return getPublicImageUrl('/uploads/blog-main-image.jpg');
    return getPublicImageUrl(image);
  }, [image]);

  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, 'facebook-share', 'width=580,height=400');
  };

  const shareLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, 'linkedin-share', 'width=550,height=550');
  };

  const shareKakao = () => {
    if (typeof window !== 'undefined' && window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
        if (!kakaoKey) return;
        window.Kakao.init(kakaoKey);
      }
      
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: shareTitle,
          description: shareDescription,
          imageUrl: shareImage,
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl,
          },
        },
        buttons: [
          {
            title: '읽어보기',
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
        ],
      });
    } else {
      const kakaoUrl = `https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(shareUrl)}`;
      window.open(kakaoUrl, '_blank');
    }
  };

  return (
    <div className={styles.shareContainer}>
      <span className={styles.shareLabel}>공유하기</span>
      <div className={styles.buttonGroup}>
        <button onClick={shareFacebook} className={styles.facebook} aria-label="Share on Facebook">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z"/>
          </svg>
        </button>
        <button onClick={shareLinkedIn} className={styles.linkedin} aria-label="Share on LinkedIn">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
          </svg>
        </button>
        {process.env.NEXT_PUBLIC_KAKAO_JS_KEY && (
          <button onClick={shareKakao} className={styles.kakao} aria-label="Share on KakaoTalk">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
               <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.558 1.712 4.8 4.312 6.098l-.804 2.947c-.05.186.07.37.26.37.1 0 .19-.04.26-.1l3.528-2.35c.465.05.94.075 1.444.075 4.97 0 9-3.185 9-7.115S16.97 3 12 3z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
