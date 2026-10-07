'use client';

import { useState, useEffect } from 'react';
import { getFilesWithUsage, deleteFile, deleteUnusedFiles, renameFile, renameAllFilesToSafeNames, replaceFile } from './actions';
import { compressImage } from '@/lib/client-utils';
import { getPublicImageUrl } from '@/lib/utils';
import styles from './files.module.css';
import Link from 'next/link';
import { useRef } from 'react';

interface FileInfo {
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
  isUsed: boolean;
}

export default function FileManagementPage() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const data = await getFilesWithUsage();
      setFiles(data);
    } catch (e) {
      alert('파일 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleReplaceClick = (filename: string) => {
    setActiveFile(filename);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeFile) return;

    if (!confirm(`${activeFile} 파일을 선택한 파일로 교체하시겠습니까?`)) {
      e.target.value = '';
      return;
    }

    setDeleting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await replaceFile(activeFile, formData);
      if (result.success) {
        alert('파일이 교체되었습니다.');
        fetchFiles();
      } else {
        alert(result.error);
      }
    } catch (err) {
      alert('파일 교체 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
      setActiveFile(null);
      e.target.value = '';
    }
  };

  const handleCompress = async (filename: string) => {
    if (!confirm('이 이미지를 압축하여 교체하시겠습니까? (원본은 백업됩니다)')) return;

    setDeleting(true);
    try {
      const filePath = `/uploads/${filename}`;
      const response = await fetch(filePath);
      const blob = await response.blob();
      const originalFile = new File([blob], filename, { type: blob.type });

      const compressedBlob = await compressImage(originalFile);
      const compressedFile = new File([compressedBlob], filename, { type: compressedBlob.type });

      const formData = new FormData();
      formData.append('file', compressedFile);
      const result = await replaceFile(filename, formData);
      
      if (result.success) {
        alert('이미지가 압축되었습니다.');
        fetchFiles();
      } else {
        alert(result.error);
      }
    } catch (err) {
      console.error(err);
      alert('압축 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm('정말로 이 파일을 삭제하시겠습니까?')) return;
    
    setDeleting(true);
    try {
      const result = await deleteFile(filename);
      if (result.success) {
        setFiles(files.filter(f => f.filename !== filename));
      } else {
        alert(result.error);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async (filename: string) => {
    const currentBaseName = filename.replace(/\.[^/.]+$/, "");
    const newBaseName = prompt('새 파일 이름을 입력하세요 (영문/숫자 권장, 확장자 제외)', currentBaseName);
    
    if (!newBaseName || newBaseName === currentBaseName) return;

    setDeleting(true);
    try {
      const result = await renameFile(filename, newBaseName);
      if (result.success && result.newFilename) {
        alert(`파일 이름이 변경되었습니다: ${result.newFilename}`);
        setFiles(files.map(f => f.filename === filename ? { 
          ...f, 
          filename: result.newFilename!, 
          path: `/uploads/${result.newFilename}` 
        } : f));
      } else {
        alert(result.error || '이름 변경에 실패했습니다.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleRenameAll = async () => {
    if (!confirm('한글/공백이 포함된 모든 파일 이름을 안전한 영문 형식으로 일괄 변경하시겠습니까? 게시글 내 이미지 링크도 자동으로 업데이트됩니다.')) return;

    setDeleting(true);
    try {
      const result = await renameAllFilesToSafeNames();
      if (result.success) {
        alert(`${result.successCount}개의 파일 이름을 변경했습니다.${result.failCount > 0 ? ` (${result.failCount}개 실패)` : ''}`);
        fetchFiles();
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteUnused = async () => {
    const unusedCount = files.filter(f => !f.isUsed).length;
    if (unusedCount === 0) {
      alert('삭제할 사용되지 않는 파일이 없습니다.');
      return;
    }

    if (!confirm(`사용되지 않는 파일 ${unusedCount}개를 모두 삭제하시겠습니까?`)) return;

    setDeleting(true);
    try {
      const result = await deleteUnusedFiles();
      if (result.success) {
        const successCount = result.successCount ?? 0;
        const failCount = result.failCount ?? 0;
        alert(`${successCount}개의 파일을 삭제했습니다.${failCount > 0 ? ` (${failCount}개 실패)` : ''}`);
        fetchFiles();
      }
    } finally {
      setDeleting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={styles.container}>
      <Link href="/admin" className={styles.backBtn}>← 어드민 대시보드</Link>
      
      <header className={styles.header}>
        <h1 className={styles.title}>파일 관리</h1>
        <div className={styles.actions}>
          <button 
            onClick={fetchFiles} 
            className={styles.deleteUnusedBtn} 
            style={{ backgroundColor: '#0070f3' }}
            disabled={loading || deleting}
          >
            새로고침
          </button>
          <button 
            onClick={handleRenameAll} 
            className={styles.deleteUnusedBtn}
            style={{ backgroundColor: '#8b5cf6' }}
            disabled={loading || deleting}
          >
            {deleting ? '처리 중...' : '파일명 일괄 최적화 (한글 → 영문)'}
          </button>
          <button 
            onClick={handleDeleteUnused} 
            className={styles.deleteUnusedBtn}
            disabled={loading || deleting}
          >
            {deleting ? '처리 중...' : '사용되지 않는 파일 모두 삭제'}
          </button>
        </div>
      </header>

      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange}
      />

      {loading ? (
        <div className={styles.empty}>파일 목록을 불러오는 중...</div>
      ) : files.length === 0 ? (
        <div className={styles.empty}>업로드된 파일이 없습니다.</div>
      ) : (
        <div className={styles.fileGrid}>
          {files.map((file) => (
            <div key={file.filename} className={styles.fileCard}>
              <div className={styles.preview}>
                {file.filename.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                  <img src={getPublicImageUrl(file.path)} alt={file.filename} loading="lazy" />
                ) : (
                  <i>📄</i>
                )}
              </div>
              <div className={styles.info}>
                <div className={styles.filename} title={file.filename}>{file.filename}</div>
                <div className={styles.meta}>
                  <span>{formatSize(file.size)}</span>
                  <span>{new Date(file.createdAt).toISOString().split('T')[0]}</span>
                </div>
                <span className={`${styles.badge} ${file.isUsed ? styles.used : styles.unused}`}>
                  {file.isUsed ? '사용 중' : '사용되지 않음'}
                </span>
              </div>
              <div className={styles.cardActions}>
                <button 
                  onClick={() => handleReplaceClick(file.filename)} 
                  className={styles.renameBtn}
                  disabled={deleting}
                  style={{ marginBottom: '0.5rem', backgroundColor: '#10b981', color: 'white' }}
                >
                  파일 교체
                </button>
                {file.filename.match(/\.(jpg|jpeg|png|webp)$/i) && (
                  <button 
                    onClick={() => handleCompress(file.filename)} 
                    className={styles.renameBtn}
                    disabled={deleting}
                    style={{ marginBottom: '0.5rem', backgroundColor: '#f59e0b', color: 'white' }}
                  >
                    이미지 압축
                  </button>
                )}
                <button 
                  onClick={() => handleRename(file.filename)} 
                  className={styles.renameBtn}
                  disabled={deleting}
                  style={{ marginBottom: '0.5rem' }}
                >
                  이름 변경
                </button>
                <button 
                  onClick={() => handleDelete(file.filename)} 
                  className={styles.deleteBtn}
                  disabled={deleting}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
