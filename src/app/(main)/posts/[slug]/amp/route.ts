import { NextRequest, NextResponse } from 'next/server';

/**
 * AMP is no longer published. Keep old URLs alive as permanent redirects so
 * search engines consolidate their signals into the canonical post URL.
 */
export function GET(request: NextRequest) {
  const canonicalUrl = new URL(request.url);
  canonicalUrl.pathname = canonicalUrl.pathname.replace(/\/amp\/?$/, '');
  canonicalUrl.search = '';

  return NextResponse.redirect(canonicalUrl, 301);
}
