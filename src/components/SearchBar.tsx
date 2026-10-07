'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, MessageSquare } from 'lucide-react';
import styles from './SearchBar.module.css';

export default function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [type, setType] = useState(searchParams.get('type') || 'all');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query.trim());
      params.set('type', type);
    }
    
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className={styles.searchContainer}>
      <div className={styles.bambooShortcutWrapper}>
        <Link href="/shorts" className={styles.bambooShortcutBtn}>
          <MessageSquare size={16} />
          <span>짧은 생각을 자유롭게 기록하고 공유하는 📝 Shorts 바로가기</span>
        </Link>
      </div>

      <form className={styles.searchBar} onSubmit={handleSearch}>
        <div className={styles.inputGroup}>
          <select 
            className={styles.select} 
            value={type} 
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">제목+내용</option>
            <option value="title">제목</option>
            <option value="content">내용</option>
          </select>
          <input
            type="text"
            className={styles.input}
            placeholder="검색어를 입력하세요..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className={styles.searchButton} aria-label="검색">
          <Search size={20} />
        </button>
      </form>
    </div>
  );
}
