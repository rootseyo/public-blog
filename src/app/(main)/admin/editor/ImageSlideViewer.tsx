'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Plus, Image as ImageIcon } from 'lucide-react';

interface ImageSlide {
  src: string;
  caption: string;
}

interface ImageSlideViewerProps {
  images: ImageSlide[];
  updateAttributes?: (attrs: any) => void;
  isReadOnly?: boolean;
  styles: any;
  onAddImage?: () => void;
  onRemoveImage?: (index: number) => void;
  onUpdateCaption?: (index: number, caption: string) => void;
}

export default function ImageSlideViewer({
  images = [],
  updateAttributes,
  isReadOnly = false,
  styles,
  onAddImage,
  onRemoveImage,
  onUpdateCaption,
}: ImageSlideViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const nextSlide = () => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevSlide = () => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  useEffect(() => {
    // If currentIndex is out of bounds (after removal), reset to last index
    if (images.length > 0 && currentIndex >= images.length) {
      setCurrentIndex(images.length - 1);
    }
  }, [images.length, currentIndex]);

  if (images.length === 0 && !isReadOnly) {
    return (
      <div className={styles.imageSlidePlaceholder} onClick={onAddImage} contentEditable={false}>
        <ImageIcon size={32} />
        <p>이미지 슬라이드에 이미지를 추가하세요</p>
        <button className={styles.imageSlideAddButton} type="button">
           이미지 선택
        </button>
      </div>
    );
  }

  if (images.length === 0) return null;

  return (
    <div className={styles.imageSlideWrapper} contentEditable={false}>
      <div className={styles.imageSlideContainer} ref={containerRef}>
        <div 
          className={styles.imageSlideTrack} 
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {images.map((img, index) => (
            <div key={index} className={styles.imageSlideItem}>
              <div className={styles.imageSlideImageWrapper}>
                <img 
                  src={img.src} 
                  alt={img.caption || `Slide ${index + 1}`} 
                  className={styles.imageSlideImage}
                />
                <div className={styles.imageSlideCounter}>
                  {index + 1} / {images.length}
                </div>
              </div>
              
              <div className={styles.imageSlideContent}>
                {isReadOnly ? (
                  img.caption && (
                    <div className={styles.imageSlideCaption}>
                      {img.caption}
                    </div>
                  )
                ) : (
                  <textarea
                    className={styles.imageSlideCaptionInput}
                    placeholder="이미지 설명을 입력하세요..."
                    value={img.caption || ''}
                    onChange={(e) => onUpdateCaption?.(index, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        
        {images.length > 1 && (
          <>
            <button 
              className={styles.imageSlideNavButtonLeft} 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); prevSlide(); }}
              type="button"
            >
              <ChevronLeft size={24} />
            </button>
            <button 
              className={styles.imageSlideNavButtonRight} 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); nextSlide(); }}
              type="button"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {!isReadOnly && (
          <button 
            className={styles.imageSlideRemoveButton} 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveImage?.(currentIndex); }}
            title="현재 이미지 삭제"
            type="button"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.imageSlideControls}>
        <div className={styles.imageSlideDots}>
          {images.map((_, index) => (
            <span 
              key={index} 
              className={`${styles.imageSlideDot} ${index === currentIndex ? styles.imageSlideDotActive : ''}`}
              onClick={() => setCurrentIndex(index)}
            />
          ))}
        </div>
        
        {!isReadOnly && (
          <button 
            className={styles.imageSlideAddButton} 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddImage?.(); }}
            type="button"
          >
            <Plus size={16} /> 이미지 추가
          </button>
        )}
      </div>
    </div>
  );
}
