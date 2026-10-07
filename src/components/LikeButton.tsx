'use client';

import { useState, useEffect } from 'react';
import { likePost, unlikePost } from '@/app/(main)/posts/actions';

interface LikeButtonProps {
  postId: number;
  initialLikes: number;
}

const getLevelColor = (count: number) => {
  if (count === 0) return '#ff4d4f'; // Level 0: Soft Red (default)
  if (count === 1) return '#fa8c16'; // Level 1: Warm Golden Orange
  if (count === 2) return '#52c41a'; // Level 2: Fresh Lime Green
  if (count === 3) return '#13c2c2'; // Level 3: Ocean Cyan
  if (count === 4) return '#2f54eb'; // Level 4: Royal Blue
  return '#722ed1'; // Level 5+: Royal Purple
};

const getLevelEmoji = (count: number, liked: boolean) => {
  if (!liked) return '🤍';
  if (count <= 1) return '❤️';
  if (count === 2) return '🧡';
  if (count === 3) return '💚';
  if (count === 4) return '💙';
  return '💜';
};

export default function LikeButton({ postId, initialLikes }: LikeButtonProps) {
  const [likes, setLikes] = useState(initialLikes);
  const [hasLiked, setHasLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if post was already liked by looking at localStorage
    let likedIds: number[] = [];
    try {
      const savedLikes = localStorage.getItem('liked_posts');
      if (savedLikes) {
        likedIds = JSON.parse(savedLikes);
      } else {
        // Fallback/Migration: Check if post was already liked by looking at cookies
        const likedPostsCookie = document.cookie
          .split('; ')
          .find(row => row.startsWith('liked_posts='))
          ?.split('=')[1];
        
        if (likedPostsCookie) {
          likedIds = JSON.parse(decodeURIComponent(likedPostsCookie));
          // Migrate to localStorage for future use
          localStorage.setItem('liked_posts', JSON.stringify(likedIds));
        }
      }
    } catch (e) {
      console.error('Failed to load liked posts', e);
    }

    if (likedIds.includes(postId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasLiked(true);
    }
  }, [postId]);

  const handleLike = async () => {
    if (loading) return;

    setLoading(true);
    if (hasLiked) {
      const result = await unlikePost(postId);
      if (result.success) {
        setLikes(prev => Math.max(0, prev - 1));
        setHasLiked(false);

        // Update localStorage
        try {
          const savedLikes = localStorage.getItem('liked_posts');
          let likedIds: number[] = [];
          if (savedLikes) {
            likedIds = JSON.parse(savedLikes);
          }
          const newLikedIds = likedIds.filter(id => id !== postId);
          localStorage.setItem('liked_posts', JSON.stringify(newLikedIds));
          
          // Sync to cookie for backward compatibility
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
          document.cookie = `liked_posts=${encodeURIComponent(JSON.stringify(newLikedIds))}; path=/; expires=${expiryDate.toUTCString()}; SameSite=Lax`;
        } catch (e) {
          console.error('Failed to update localStorage on unlike', e);
        }
      }
    } else {
      const result = await likePost(postId);
      if (result.success) {
        setLikes(prev => prev + 1);
        setHasLiked(true);

        // Update localStorage
        try {
          const savedLikes = localStorage.getItem('liked_posts');
          let likedIds: number[] = [];
          if (savedLikes) {
            likedIds = JSON.parse(savedLikes);
          }
          if (!likedIds.includes(postId)) {
            likedIds.push(postId);
          }
          localStorage.setItem('liked_posts', JSON.stringify(likedIds));
          
          // Sync to cookie for backward compatibility
          const expiryDate = new Date();
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
          document.cookie = `liked_posts=${encodeURIComponent(JSON.stringify(likedIds))}; path=/; expires=${expiryDate.toUTCString()}; SameSite=Lax`;
        } catch (e) {
          console.error('Failed to update localStorage on like', e);
        }
      }
    }
    setLoading(false);
  };

  const themeColor = getLevelColor(likes);
  const emoji = getLevelEmoji(likes, hasLiked);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '2rem 0', padding: '0 1rem', boxSizing: 'border-box' }}>
      <button
        onClick={handleLike}
        disabled={loading}
        className={`like-button ${likes === 0 && !hasLiked ? 'glow-effect' : ''}`}
        style={{
          '--theme-color': themeColor,
          '--theme-color-glow-low': `${themeColor}1a`,
          '--theme-color-glow-high': `${themeColor}66`,
          background: hasLiked ? themeColor : 'white',
          color: hasLiked ? 'white' : themeColor,
          border: `2px solid ${themeColor}`,
          borderRadius: '50px',
          padding: '0.8rem 2rem',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          boxShadow: hasLiked ? 'none' : `0 4px 12px ${themeColor}26`,
          maxWidth: '100%',
          boxSizing: 'border-box'
        } as React.CSSProperties}
      >
        <style jsx>{`
          @media (max-width: 640px) {
            .like-button {
              padding: 0.7rem 1.25rem !important;
              font-size: 0.95rem !important;
              width: 100%;
            }
          }
          @keyframes breathe-glow {
            0% {
              box-shadow: 0 0 5px var(--theme-color-glow-low), inset 0 0 5px var(--theme-color-glow-low);
              border-color: var(--theme-color);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 16px var(--theme-color-glow-high), inset 0 0 8px var(--theme-color-glow-low);
              border-color: var(--theme-color);
              transform: scale(1.03);
            }
            100% {
              box-shadow: 0 0 5px var(--theme-color-glow-low), inset 0 0 5px var(--theme-color-glow-low);
              border-color: var(--theme-color);
              transform: scale(1);
            }
          }
          .glow-effect {
            animation: breathe-glow 2.2s infinite ease-in-out;
          }
          .like-button:hover:not(:disabled) {
            transform: scale(1.05);
            box-shadow: 0 6px 16px var(--theme-color-glow-high) !important;
          }
          .like-button:active:not(:disabled) {
            transform: scale(0.95);
          }
        `}</style>
        <span>{emoji}</span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hasLiked ? '응원 감사합니다!' : '도움이 되었어요'}
        </span>
        {likes > 0 && <span style={{ marginLeft: '0.3rem', opacity: 0.8 }}>{likes}</span>}
      </button>
      <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#888', textAlign: 'center' }}>
        {hasLiked 
          ? '한 번 더 누르면 응원이 취소됩니다.' 
          : (likes === 0 ? '첫 번째로 도움이 되었어요를 눌러보세요' : '로그인 없이 좋아요를 남길 수 있습니다.')
        }
      </p>
    </div>
  );
}
