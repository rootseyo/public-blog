'use client';

import { useState, useEffect } from 'react';
import { addCategory, updateCategory, deleteCategory, toggleCategoryVisibility, updateCategoryOrders } from '../actions';
import { useRouter } from 'next/navigation';
import styles from '../admin.module.css';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  slug: string;
  is_visible: boolean;
  sort_order: number;
}

export default function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const router = useRouter();

  // Sync state when initialCategories changes (e.g. after server action refresh)
  // Only sync if not currently editing to prevent state jump
  useEffect(() => {
    if (editingId === null) {
      setCategories(initialCategories);
    }
  }, [initialCategories, editingId]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await addCategory(formData);
    if (result.success) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } else {
      alert(result.error);
    }
    setLoading(false);
  }

  async function handleUpdate(id: number, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await updateCategory(id, formData);
    if (result.success) {
      setEditingId(null);
      router.refresh();
    } else {
      alert(result.error);
    }
    setLoading(false);
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" 카테고리를 삭제하시겠습니까?`)) return;
    setLoading(true);
    const result = await deleteCategory(id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
    setLoading(false);
  }

  async function handleToggleVisibility(id: number, current: boolean) {
    setLoading(true);
    const result = await toggleCategoryVisibility(id, current);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
    setLoading(false);
  }

  async function moveCategory(index: number, direction: 'up' | 'down') {
    if (loading) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= categories.length) return;

    const newCategories = [...categories];
    const temp = newCategories[index];
    newCategories[index] = newCategories[newIndex];
    newCategories[newIndex] = temp;

    setCategories(newCategories);
    setLoading(true);

    const orders = newCategories.map((cat, idx) => ({
      id: cat.id,
      sort_order: idx
    }));

    const result = await updateCategoryOrders(orders);
    if (!result.success) {
      alert(result.error);
      setCategories(initialCategories);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 추가 폼 */}
      <div className={styles.analyticsCard}>
        <h3 className={styles.cardTitle}>새 카테고리 추가</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input type="text" name="name" placeholder="카테고리 이름" required className={styles.input} style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
          <input type="text" name="slug" placeholder="슬러그 (영문, 숫자, 하이픈)" required className={styles.input} style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
          <button type="submit" disabled={loading} className={styles.createButton}>추가</button>
        </form>
      </div>

      {/* 리스트 */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '80px' }}>순서</th>
              <th>ID</th>
              <th>이름</th>
              <th>슬러그</th>
              <th>상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, index) => (
              <tr key={cat.id}>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                    <button 
                      type="button"
                      onClick={() => moveCategory(index, 'up')} 
                      disabled={index === 0 || loading || editingId !== null}
                      className={styles.editButton}
                      style={{ padding: '2px', minWidth: 'auto' }}
                      title="위로 이동"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => moveCategory(index, 'down')} 
                      disabled={index === categories.length - 1 || loading || editingId !== null}
                      className={styles.editButton}
                      style={{ padding: '2px', minWidth: 'auto' }}
                      title="아래로 이동"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                </td>
                <td data-label="ID">{cat.id}</td>
                <td data-label="이름">
                  {editingId === cat.id ? (
                    <>
                      <form id={`edit-form-${cat.id}`} onSubmit={(e) => handleUpdate(cat.id, e)}>
                        <input type="hidden" name="sortOrder" value={cat.sort_order} />
                      </form>
                      <input 
                        form={`edit-form-${cat.id}`}
                        type="text" 
                        name="name" 
                        defaultValue={cat.name} 
                        required 
                        style={{ width: '100%', padding: '0.3rem', border: '1px solid var(--border-color)', borderRadius: '4px' }} 
                      />
                    </>
                  ) : (
                    cat.name
                  )}
                </td>
                <td data-label="슬러그">
                  {editingId === cat.id ? (
                    <input 
                      form={`edit-form-${cat.id}`}
                      type="text" 
                      name="slug" 
                      defaultValue={cat.slug} 
                      required 
                      style={{ width: '100%', padding: '0.3rem', border: '1px solid var(--border-color)', borderRadius: '4px' }} 
                    />
                  ) : (
                    cat.slug
                  )}
                </td>
                <td data-label="상태">
                  <span className={`${styles.statusBadge} ${cat.is_visible ? styles.published : styles.draft}`}>
                    {cat.is_visible ? '표시' : '숨김'}
                  </span>
                </td>
                <td data-label="관리">
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    {editingId === cat.id ? (
                      <>
                        <button type="submit" form={`edit-form-${cat.id}`} className={styles.editButton} style={{ color: '#0070f3' }}>저장</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingId(null); }} className={styles.editButton}>취소</button>
                      </>
                    ) : (
                      <>
                        <button 
                          type="button" 
                          onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            setEditingId(cat.id); 
                          }} 
                          className={styles.editButton}
                        >
                          수정
                        </button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleVisibility(cat.id, cat.is_visible); }} className={styles.editButton}>
                          {cat.is_visible ? '숨기기' : '표시'}
                        </button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(cat.id, cat.name); }} className={styles.editButton} style={{ color: '#e53e3e', borderColor: '#feb2b2' }}>삭제</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#888', textAlign: 'center' }}>
        💡 화살표 버튼을 클릭하여 카테고리 순서를 변경할 수 있습니다.
      </p>
    </div>
  );
}
