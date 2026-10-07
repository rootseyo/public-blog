'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  X, 
  ShieldAlert,
  EyeOff,
  Globe,
  RefreshCw
} from 'lucide-react';
import styles from './bamboo.module.css';
import { 
  adminUpdateBambooPost, 
  adminDeleteBambooPost,
  adminUpdateBambooSeo,
  adminRegenerateBambooSeo,
  addForbiddenWord,
  deleteForbiddenWord,
  getBambooSeoMigrationStatusAction,
  runBambooSeoDryRunAction,
  runBambooSeoMigrationAction
} from '../actions';

interface BambooPostData {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
  seo_title?: string;
  slug?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string[];
  summary?: string;
  category?: string;
  tags?: string[];
  seo_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  indexable?: boolean;
  ai_generated_at?: string;
  ai_model?: string;
  ai_error?: string;
  seo_locked?: boolean;
}

interface ForbiddenWord {
  id: number;
  word: string;
  category: string;
}

interface BambooManagerProps {
  initialPosts: BambooPostData[];
  initialForbiddenWords: ForbiddenWord[];
}

const CATEGORY_MAP: Record<string, string> = {
  abuse: '욕설/비하',
  sexual: '음란/선정성',
  political: '정치비하',
  other: '기타'
};

export default function BambooManager({ initialPosts, initialForbiddenWords }: BambooManagerProps) {
  const [activeTab, setActiveTab] = useState<'posts' | 'forbiddenWords' | 'seoMigration'>('posts');
  const [posts, setPosts] = useState<BambooPostData[]>(initialPosts);
  const [forbiddenWords, setForbiddenWords] = useState<ForbiddenWord[]>(initialForbiddenWords);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Migration state
  const [migrationStats, setMigrationStats] = useState<any>(null);
  const [dryRunData, setDryRunData] = useState<any>(null);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState<number>(10);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  
  // Edit post state
  const [editingPost, setEditingPost] = useState<BambooPostData | null>(null);
  const [editContent, setEditContent] = useState('');

  // Add forbidden word state
  const [newWord, setNewWord] = useState('');
  const [newCategory, setNewCategory] = useState('abuse');
  
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Highlight forbidden words inside content
  const renderHighlightedContent = (content: string, wordsList: ForbiddenWord[]) => {
    if (!wordsList || wordsList.length === 0 || !content) return content;
    
    // Sort words by length descending so longer words match first
    const sortedWords = [...wordsList]
      .map(w => w.word)
      .sort((a, b) => b.length - a.length);
      
    if (sortedWords.length === 0) return content;
    
    const escapedWords = sortedWords.map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');
    
    const parts = content.split(regex);
    return parts.map((part, idx) => {
      const isMatched = sortedWords.some(w => w.toLowerCase() === part.toLowerCase());
      return isMatched ? (
        <mark key={idx} className={styles.highlight}>{part}</mark>
      ) : (
        part
      );
    });
  };

  // Check if content contains any forbidden words
  const getDetectedWords = (content: string) => {
    return forbiddenWords.filter(fw => 
      content.toLowerCase().includes(fw.word.toLowerCase())
    );
  };

  // Handle post update (admin edit)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost) return;

    if (!editContent.trim()) {
      alert('내용을 입력해 주세요.');
      return;
    }

    startTransition(async () => {
      const res = await adminUpdateBambooPost(editingPost.id, editContent);
      if (res.success) {
        setPosts(prev => 
          prev.map(p => p.id === editingPost.id ? { ...p, content: editContent.trim() } : p)
        );
        setEditingPost(null);
        router.refresh();
      } else {
        alert(res.error || '수정 중 오류가 발생했습니다.');
      }
    });
  };

  // Handle post delete (admin delete)
  const handleDeletePost = async (postId: number) => {
    if (!confirm('이 익명 게시글을 완전히 삭제하시겠습니까?')) return;

    startTransition(async () => {
      const res = await adminDeleteBambooPost(postId);
      if (res.success) {
        setPosts(prev => prev.filter(p => p.id !== postId));
        router.refresh();
      } else {
        alert(res.error || '삭제 중 오류가 발생했습니다.');
      }
    });
  };

  // Handle adding forbidden word
  const handleAddWordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWord = newWord.trim();
    if (!cleanWord) {
      alert('금칙어를 입력해 주세요.');
      return;
    }

    startTransition(async () => {
      const res = await addForbiddenWord(cleanWord, newCategory);
      if (res.success) {
        setNewWord('');
        router.refresh();
        setForbiddenWords(prev => [
          ...prev, 
          { id: Math.random(), word: cleanWord, category: newCategory }
        ]);
        window.location.reload();
      } else {
        alert(res.error || '금칙어 추가 중 오류가 발생했습니다.');
      }
    });
  };

  // Handle deleting forbidden word
  const handleDeleteWord = async (id: number, word: string) => {
    if (!confirm(`'${word}'을(를) 금칙어 목록에서 삭제하시겠습니까?`)) return;

    startTransition(async () => {
      const res = await deleteForbiddenWord(id);
      if (res.success) {
        setForbiddenWords(prev => prev.filter(w => w.id !== id));
        router.refresh();
      } else {
        alert(res.error || '금칙어 삭제 중 오류가 발생했습니다.');
      }
    });
  };

  // Filter posts based on search query
  const filteredPosts = posts.filter(p => 
    p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.author_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group forbidden words by category
  const groupedForbiddenWords = forbiddenWords.reduce<Record<string, ForbiddenWord[]>>((acc, word) => {
    if (!acc[word.category]) acc[word.category] = [];
    acc[word.category].push(word);
    return acc;
  }, {});

  const handleLoadMigrationStatus = async () => {
    const res = await getBambooSeoMigrationStatusAction();
    if (res.success) {
      setMigrationStats(res.stats);
    }
  };

  const handleRunDryRun = async () => {
    setIsMigrating(true);
    setMigrationLogs(prev => [...prev, '🔍 Dry-Run 실행 중...']);
    const res = await runBambooSeoDryRunAction({ batchSize });
    setIsMigrating(false);
    if (res.success && res.dryRunData) {
      setDryRunData(res.dryRunData);
      setMigrationLogs(prev => [...prev, `✅ Dry-Run 완료! 대상: ${res.dryRunData.targetPosts}건, 예상 배치: ${res.dryRunData.estimatedBatches}개`]);
    } else {
      alert(res.error || 'Dry-Run 중 오류가 발생했습니다.');
    }
  };

  const handleStartMigration = async (forceAll = false, retryFailedOnly = false) => {
    if (!confirm(forceAll ? '전체 게시글의 SEO 메타데이터를 강제 재생성하시겠습니까?' : '기존 게시글 SEO 마이그레이션을 시작하시겠습니까?')) {
      return;
    }

    setIsMigrating(true);
    setMigrationLogs(prev => [...prev, `🚀 마이그레이션 배치 시작 (Batch Size: ${batchSize})...`]);

    let count = 0;
    while (true) {
      const res = await runBambooSeoMigrationAction({
        batchSize,
        forceAll: forceAll && count === 0,
        retryFailedOnly
      });

      if (!res.success || !res.result || res.result.processed === 0) {
        setMigrationLogs(prev => [...prev, '✅ 모든 마이그레이션 작업이 완료되었습니다.']);
        break;
      }

      count += res.result.processed;
      setMigrationLogs(prev => [
        ...prev,
        `▶ 배치 완료 - 처리: ${res.result.processed}건 | 성공: ${res.result.succeeded}건 | 실패: ${res.result.failed}건`
      ]);

      await handleLoadMigrationStatus();

      if (res.result.processed === 0 || res.result.totalTarget === 0) break;
    }

    setIsMigrating(false);
    await handleLoadMigrationStatus();
    router.refresh();
  };

  const handleExportData = (format: 'csv' | 'json') => {
    window.open(`/api/admin/shorts/seo-migration?export=${format}`, '_blank');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>📝 Shorts 관리</h1>
      </header>

      {/* Navigation tabs */}
      <div className={styles.tabs}>
        <button 
          onClick={() => setActiveTab('posts')}
          className={`${styles.tab} ${activeTab === 'posts' ? styles.activeTab : ''}`}
        >
          📝 Shorts 게시글
          <span className={styles.badge}>{posts.length}</span>
        </button>
        <button 
          onClick={() => setActiveTab('forbiddenWords')}
          className={`${styles.tab} ${activeTab === 'forbiddenWords' ? styles.activeTab : ''}`}
        >
          금칙어 설정
          <span className={styles.badge}>{forbiddenWords.length}</span>
        </button>
        <button 
          onClick={() => {
            setActiveTab('seoMigration');
            handleLoadMigrationStatus();
          }}
          className={`${styles.tab} ${activeTab === 'seoMigration' ? styles.activeTab : ''}`}
        >
          SEO 마이그레이션
          <span className={styles.badge} style={{ background: '#4f46e5', color: '#fff' }}>AI</span>
        </button>
      </div>

      {activeTab === 'posts' ? (
        <>
          {/* Controls bar */}
          <div className={styles.controls}>
            <div className={styles.searchWrapper}>
              <Search size={16} className={styles.searchIcon} />
              <input 
                type="text"
                placeholder="작성자 또는 내용으로 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>

          {/* Posts Table */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>ID</th>
                  <th style={{ width: '100px' }}>작성자</th>
                  <th>내용 (금칙어 강조)</th>
                  <th style={{ width: '140px' }}>감지 상태</th>
                  <th style={{ width: '160px' }}>작성일</th>
                  <th style={{ width: '120px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredPosts.length > 0 ? (
                  filteredPosts.map(post => {
                    const detected = getDetectedWords(post.content);
                    const hasForbidden = detected.length > 0;

                    return (
                      <tr key={post.id}>
                        <td data-label="ID">#{post.id}</td>
                        <td data-label="작성자">
                          <strong>{post.author_name}</strong>
                        </td>
                        <td data-label="내용">
                          <div style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto' }}>
                            {renderHighlightedContent(post.content, forbiddenWords)}
                          </div>
                        </td>
                        <td data-label="감지 상태">
                          {hasForbidden ? (
                            <span className={styles.warningBadge} title={`감지된 단어: ${detected.map(d => d.word).join(', ')}`}>
                              <AlertTriangle size={14} />
                              위험 ({detected.length}개)
                            </span>
                          ) : (
                            <span className={styles.safeBadge}>
                              <CheckCircle size={14} />
                              안전
                            </span>
                          )}
                        </td>
                        <td data-label="작성일" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(post.created_at).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td data-label="관리">
                          <div className={styles.actionButtons}>
                            <button 
                              onClick={() => {
                                setEditingPost(post);
                                setEditContent(post.content);
                              }}
                              className={`${styles.actionButton} ${styles.editBtn}`}
                              title="게시글 수정"
                            >
                              <Edit3 size={14} />
                              수정
                            </button>
                            <button 
                              onClick={() => handleDeletePost(post.id)}
                              className={`${styles.actionButton} ${styles.deleteBtn}`}
                              title="게시글 삭제"
                              disabled={isPending}
                            >
                              <Trash2 size={14} />
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      게시글이 존재하지 않거나 검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : activeTab === 'forbiddenWords' ? (
        /* Forbidden Words Tab */
        <div className={styles.forbiddenLayout}>
          {/* Add Word Form Card */}
          <div className={styles.configCard}>
            <h2 className={styles.modalTitle} style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>금칙어 등록</h2>
            <p className={styles.cardSubtitle}>📝 Shorts 게시글 감지에 사용될 키워드를 등록합니다.</p>

            <form onSubmit={handleAddWordSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.label}>단어</label>
                <input 
                  type="text"
                  placeholder="예: 바보, 광고 등"
                  value={newWord}
                  onChange={e => setNewWord(e.target.value)}
                  className={styles.input}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>카테고리</label>
                <select 
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className={styles.select}
                >
                  <option value="abuse">욕설/비하</option>
                  <option value="sexual">음란/선정성</option>
                  <option value="political">정치비하</option>
                  <option value="other">기타</option>
                </select>
              </div>

              <button 
                type="submit" 
                className={styles.addWordBtn}
                disabled={isPending || !newWord.trim()}
              >
                <Plus size={16} />
                금칙어 추가
              </button>
            </form>
          </div>

          {/* Word List */}
          <div className={styles.wordListContainer}>
            {Object.keys(CATEGORY_MAP).map(catKey => {
              const wordsInCat = groupedForbiddenWords[catKey] || [];
              return (
                <div key={catKey} className={styles.categoryCard}>
                  <div className={styles.categoryHeader}>
                    <h3 className={styles.categoryTitle}>{CATEGORY_MAP[catKey]}</h3>
                    <span className={styles.categoryBadge}>{wordsInCat.length}개</span>
                  </div>
                  
                  {wordsInCat.length > 0 ? (
                    <div className={styles.wordChips}>
                      {wordsInCat.map(w => (
                        <span key={w.id} className={styles.wordChip}>
                          {w.word}
                          <button 
                            onClick={() => handleDeleteWord(w.id, w.word)}
                            className={styles.deleteWordBtn}
                            title="삭제"
                            disabled={isPending}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptyState}>등록된 단어가 없습니다.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* SEO Migration Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Migration Stats Summary Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className={styles.configCard} style={{ textAlign: 'center', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>전체 게시글</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0.4rem 0' }}>{migrationStats?.totalPosts || 0}개</div>
              <div style={{ fontSize: '0.75rem', color: '#10b981' }}>대상: {migrationStats?.targetPosts || 0}개</div>
            </div>
            <div className={styles.configCard} style={{ textAlign: 'center', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>완료된 게시글</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#10b981', margin: '0.4rem 0' }}>{migrationStats?.completedCount || 0}개</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>성공률: {migrationStats?.successRate || '0%'}</div>
            </div>
            <div className={styles.configCard} style={{ textAlign: 'center', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>대기 중 / 실패</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#f59e0b', margin: '0.4rem 0' }}>
                {migrationStats?.pendingCount || 0} / <span style={{ color: '#ef4444' }}>{migrationStats?.failedCount || 0}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>스킵됨: {migrationStats?.skippedCount || 0}개</div>
            </div>
            <div className={styles.configCard} style={{ textAlign: 'center', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>인덱싱 설정</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3b82f6', margin: '0.4rem 0' }}>
                {migrationStats?.indexableCount || 0}개
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>noindex: {migrationStats?.noindexCount || 0}개</div>
            </div>
          </div>

          {/* Action Control Panel */}
          <div className={styles.configCard}>
            <h2 className={styles.modalTitle} style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>SEO 마이그레이션 제어판</h2>
            <p className={styles.cardSubtitle} style={{ marginBottom: '1rem' }}>
              OpenAI API를 이용해 기존 게시글 메타데이터 및 상세 URL(/shorts/ID-slug)을 안전하게 백필합니다.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label className={styles.label} style={{ marginBottom: 0 }}>배치 크기:</label>
                <input 
                  type="number"
                  min={1}
                  max={50}
                  value={batchSize}
                  onChange={e => setBatchSize(parseInt(e.target.value, 10) || 10)}
                  className={styles.input}
                  style={{ width: '80px', padding: '0.4rem 0.6rem' }}
                />
              </div>

              <button 
                onClick={handleRunDryRun}
                disabled={isMigrating}
                className={styles.addWordBtn}
                style={{ background: '#4f46e5' }}
              >
                <Search size={16} />
                Dry-Run 시뮬레이션
              </button>

              <button 
                onClick={() => handleStartMigration(false, false)}
                disabled={isMigrating}
                className={styles.addWordBtn}
                style={{ background: '#10b981' }}
              >
                <RefreshCw size={16} className={isMigrating ? styles.spinning : ''} />
                마이그레이션 시작
              </button>

              <button 
                onClick={() => handleStartMigration(false, true)}
                disabled={isMigrating}
                className={styles.addWordBtn}
                style={{ background: '#f59e0b' }}
              >
                <AlertTriangle size={16} />
                실패건만 재처리
              </button>

              <button 
                onClick={() => handleStartMigration(true, false)}
                disabled={isMigrating}
                className={styles.addWordBtn}
                style={{ background: '#dc2626' }}
              >
                <ShieldAlert size={16} />
                전체 강제 재생성
              </button>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => handleExportData('json')} className={styles.cancelBtn} style={{ fontSize: '0.8rem' }}>
                  JSON 내보내기
                </button>
                <button onClick={() => handleExportData('csv')} className={styles.cancelBtn} style={{ fontSize: '0.8rem' }}>
                  CSV 내보내기
                </button>
              </div>
            </div>

            {/* Dry Run Preview Box */}
            {dryRunData && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-tertiary, #1f2937)', borderRadius: '8px', border: '1px solid #374151' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#818cf8', marginBottom: '0.5rem' }}>
                  📋 Dry-Run 미리보기 결과 (대상: {dryRunData.targetPosts}건 / 예상 배치: {dryRunData.estimatedBatches}개)
                </h3>
                <div style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
                  <p>• 예상 API 호출 수: <strong>{dryRunData.estimatedApiCalls}</strong> | 예상 Indexable 비율: <strong>{dryRunData.estimatedIndexableCount}건</strong> / Noindex: <strong>{dryRunData.estimatedNoindexCount}건</strong></p>
                  <p>• Slug 충돌 가능성: <strong>{dryRunData.potentialSlugCollisions.length}건</strong></p>
                </div>
                {dryRunData.samples && dryRunData.samples.length > 0 && (
                  <div style={{ marginTop: '0.8rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#9ca3af', marginBottom: '0.4rem' }}>샘플 결과 (상위 3건):</div>
                    {dryRunData.samples.slice(0, 3).map((s: any) => (
                      <div key={s.id} style={{ fontSize: '0.8rem', background: '#111827', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.3rem' }}>
                        ID #{s.id}: <strong>"{s.seoTitle}"</strong> → <code>/shorts/{s.id}-{s.slug}</code> (indexable: {String(s.indexable)})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Logs Window */}
            {migrationLogs.length > 0 && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#111827', color: '#10b981', fontFamily: 'monospace', fontSize: '0.8rem', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {migrationLogs.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Post Modal */}
      {editingPost && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>익명 게시글 수정 (관리자)</h2>
            <form onSubmit={handleEditSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.label}>작성자</label>
                <input 
                  type="text" 
                  value={editingPost.author_name} 
                  disabled 
                  className={styles.input}
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>내용</label>
                <textarea 
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className={styles.textarea}
                  maxLength={2000}
                  required
                />
                <span className={styles.label} style={{ textAlign: 'right', fontSize: '0.75rem' }}>
                  {editContent.length}/2000자
                </span>
              </div>

              <div className={styles.modalActions}>
                <button 
                  type="button" 
                  onClick={() => setEditingPost(null)}
                  className={styles.cancelBtn}
                  disabled={isPending}
                >
                  취소
                </button>
                <button 
                  type="submit" 
                  className={styles.submitBtn}
                  disabled={isPending}
                >
                  {isPending ? '수정 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
