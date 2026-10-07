'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Navbar.module.css';
import { ChevronDown } from 'lucide-react';

export default function Navbar({ popularPosts = [], categories = [] }: { popularPosts?: any[], categories?: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isPostDetail = pathname.startsWith('/posts/');
  const isAdminPage = pathname.startsWith('/admin');
  const isLensPage = pathname?.startsWith('/lens/');

  // 메뉴 열림 상태에 따라 스크롤 제어
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
      setIsCategoryExpanded(false); // 메뉴 닫힐 때 카테고리도 초기화
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => {
    setIsOpen(false);
    setIsCategoryExpanded(false);
  }, [pathname]);

  return (
    <nav className={styles.nav}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          {isHome ? (
            <h1>Bright Notes</h1>
          ) : isAdminPage ? (
            <p className={styles.logoText}>Bright Notes (관리자)</p>
          ) : (
            <p className={styles.logoText}>Bright Notes</p>
          )}
        </Link>

        <button 
          className={styles.mobileMenuBtn}
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
        >
          {isOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          )}
        </button>

        {/* Backdrop */}
        <div 
          className={`${styles.backdrop} ${isOpen ? styles.active : ''}`} 
          onClick={() => setIsOpen(false)}
        />

        <div className={`${styles.menu} ${isOpen ? styles.active : ''}`}>
          <Link href="/" className={styles.link}>Home</Link>
          <Link href="/bamboo" className={styles.link}>📝 Shorts</Link>
          
          {categories.length > 0 && !isAdminPage && (
            <>
              {/* Desktop Category Menu */}
              <div className={styles.navItem}>
                <button className={styles.dropdownTrigger}>
                  Categories <ChevronDown size={14} />
                </button>
                <div className={styles.dropdownMenu}>
                  {categories.map((category: any) => (
                    <Link 
                      key={category.id} 
                      href={`/categories/${category.slug}`}
                      className={styles.dropdownItem}
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Mobile Category Menu (Accordion) */}
              <div className={styles.mobileCategories}>
                <button 
                  className={styles.mobileCategoryTrigger}
                  onClick={() => setIsCategoryExpanded(!isCategoryExpanded)}
                >
                  Categories 
                  <ChevronDown 
                    size={18} 
                    style={{ 
                      transform: isCategoryExpanded ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.3s ease'
                    }} 
                  />
                </button>
                <div className={`${styles.mobileCategoryContent} ${isCategoryExpanded ? styles.expanded : ''}`}>
                  <div className={styles.mobileCategoryList}>
                    {categories.map((category: any) => (
                      <Link 
                        key={category.id} 
                        href={`/categories/${category.slug}`}
                        className={styles.mobileCategoryItem}
                      >
                        {category.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <Link href="/collaboration" className={styles.link}>Contact</Link>
          
          {popularPosts.length > 0 && !isAdminPage && !isLensPage && (
            <div className={styles.popularSection} data-nosnippet>
              <p className={styles.popularTitle}>실시간 인기글 Top 10</p>
              <ul className={styles.popularList}>
                {popularPosts.map((post, index) => (
                  <li key={post.id} className={styles.popularItem}>
                    <Link href={`/posts/${post.slug || post.id}`} className={styles.popularLink}>
                      <span className={styles.popularRank}>{index + 1}</span>
                      <span className={styles.popularPostTitle}>{post.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    </nav>
  );
}
