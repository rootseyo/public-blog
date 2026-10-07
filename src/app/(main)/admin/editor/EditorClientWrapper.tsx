'use client';

import dynamic from 'next/dynamic';

const EditorInner = dynamic(() => import('./EditorClient').then(m => m.EditorInner), {
  ssr: false,
  loading: () => <div style={{ padding: '2rem', textAlign: 'center' }}>에디터를 불러오는 중...</div>,
});

export default function EditorClientWrapper() {
  return <EditorInner />;
}
