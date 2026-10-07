'use client';

import { useEffect } from 'react';
import { logVisit } from './actions';

export default function ViewTracker({ postId, path = '/' }: { postId?: number, path?: string }) {
  useEffect(() => {
    // Pass document.referrer to get the actual external source
    const clientReferrer = typeof document !== 'undefined' ? document.referrer : '';
    logVisit(postId, path, clientReferrer);
  }, [postId, path]);

  return null;
}
