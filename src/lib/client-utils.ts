'use client';

import Compressor from 'compressorjs';

export function compressImage(file: File, options: Compressor.Options = {}): Promise<File | Blob> {
  // GIF 파일은 압축 시 애니메이션이 손실되므로 원본 그대로 반환
  if (file.type === 'image/gif') {
    return Promise.resolve(file);
  }

  return new Promise((resolve, reject) => {
    new Compressor(file, {
      quality: 0.6,
      maxWidth: 1920,
      maxHeight: 1920,
      convertSize: 1000000, // 1MB 이상일 경우 JPG로 변환
      ...options,
      success(result) {
        resolve(result);
      },
      error(err) {
        reject(err);
      },
    });
  });
}
