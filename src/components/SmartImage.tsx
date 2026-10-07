'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getPublicImageUrl } from '@/lib/utils';

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  fill?: boolean; // fill 모드 여부 추가 (기본값 true)
}

export default function SmartImage({ src, alt, className, priority, fill = true }: SmartImageProps) {
  const [error, setError] = useState(false);
  const imageUrl = getPublicImageUrl(src);
  const isGif = !!(src.toLowerCase().endsWith('.gif') || (imageUrl && imageUrl.toLowerCase().endsWith('.gif')));

  if (error || !imageUrl) return null;

  if (!fill) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        className={className}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      <Image
        src={imageUrl}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1660px) 50vw, 33vw"
        style={{ objectFit: 'cover' }}
        onError={() => setError(true)}
        priority={priority}
        unoptimized={isGif}
      />
    </div>
  );
}
