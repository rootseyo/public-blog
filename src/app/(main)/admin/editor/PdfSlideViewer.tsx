'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Worker 설정 (CORS 이슈 및 성능 최적화)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfSlideViewerProps {
  url: string;
  descriptions?: { [key: string]: string };
  updateAttributes?: (attrs: any) => void;
  isReadOnly?: boolean;
  styles: any; // CSS Module 객체를 전달받음
}

export default function PdfSlideViewer({ url, descriptions = {}, updateAttributes, isReadOnly = false, styles }: PdfSlideViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [localDesc, setLocalDesc] = useState(descriptions[1] || '');
  const [containerWidth, setContainerWidth] = useState<number>(700);
  const containerRef = useRef<HTMLDivElement>(null);

  // 컨테이너 크기 감지 (반응형 대응)
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        // 부모 요소의 실제 가용 너비를 계산 (패딩 제외)
        const computedStyle = window.getComputedStyle(containerRef.current);
        const paddingLeft = parseFloat(computedStyle.paddingLeft);
        const paddingRight = parseFloat(computedStyle.paddingRight);
        // 패딩과 여유를 더 보수적으로 잡음 (가로 스크롤 완전 차단)
        const availableWidth = containerRef.current.clientWidth - paddingLeft - paddingRight;
        setContainerWidth(Math.max(200, Math.floor(availableWidth) - 8));
      }
    };

    // ResizeObserver를 사용하여 더 정확하게 감지
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    updateWidth();
    return () => resizeObserver.disconnect();
  }, []);

  // options 객체 메모이제이션 (재로드 방지 핵심)
  const options = useMemo(() => ({
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
  }), []);

  // 페이지 이동 시 설명 텍스트 업데이트
  useEffect(() => {
    setLocalDesc(descriptions[pageNumber] || '');
  }, [pageNumber, descriptions]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    // Note: PDF가 로드될 때마다 1페이지로 강제 이동하는 로직을 제거하여 
    // 페이지 이동 중 재로드(가끔 발생) 시에도 상태를 유지하게 합니다.
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    const newValue = e.target.value;
    setLocalDesc(newValue);
    
    // Tiptap의 descriptions 데이터 업데이트
    if (updateAttributes) {
      const updatedDescriptions = { ...descriptions, [pageNumber]: newValue };
      updateAttributes({ descriptions: updatedDescriptions });
    }
  };

  const changePage = (offset: number) => {
    setPageNumber((prev) => {
      const newPage = prev + offset;
      if (numPages && (newPage < 1 || newPage > numPages)) return prev;
      return newPage;
    });
  };

  const previousPage = () => changePage(-1);
  const nextPage = () => changePage(1);

  if (!url) return null;

  return (
    <div className={styles.pdfViewerWrapper} contentEditable={false}>
      <div className={styles.pdfCanvasContainer} ref={containerRef}>
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<p>PDF를 불러오는 중...</p>}
          error={<p>PDF를 불러오지 못했습니다.</p>}
          options={options}
        >
          <Page 
            pageNumber={pageNumber} 
            renderTextLayer={false} 
            renderAnnotationLayer={false}
            width={containerWidth}
          />
        </Document>
      </div>

      {numPages && numPages > 1 && (
        <div className={styles.pdfControls}>
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={previousPage}
            className={styles.pdfNavButton}
            title="이전 페이지"
          >
            ◀
          </button>
          
          <span className={styles.pageInfo}>
            {pageNumber} / {numPages}
          </span>

          <button
            type="button"
            disabled={pageNumber >= (numPages || 0)}
            onClick={nextPage}
            className={styles.pdfNavButton}
            title="다음 페이지"
          >
            ▶
          </button>
        </div>
      )}

      {/* 페이지별 설명란 (읽기 전용일 때는 div, 편집 중일 때는 textarea) */}
      {isReadOnly ? (
        localDesc && (
          <div className={styles.pdfDescriptionBox}>
            {localDesc}
          </div>
        )
      ) : (
        <textarea
          className={styles.pdfDescriptionBox}
          placeholder={`장표 ${pageNumber}에 대한 설명을 입력하세요...`}
          value={localDesc}
          onChange={handleDescChange}
        />
      )}
      
      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', width: '100%', textAlign: 'right' }}>
        <a href={url} target="_blank" rel="noopener noreferrer">원본 PDF 보기</a>
      </div>
    </div>
  );
}
