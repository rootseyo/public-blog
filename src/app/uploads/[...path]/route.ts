import { NextRequest, NextResponse } from 'next/server';

function storageUrl(path: string[]) {
  if (!path.length || path.some((segment) => segment === '.' || segment === '..')) {
    return null;
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  }

  const objectPath = ['uploads', ...path.map((s) => encodeURIComponent(decodeURIComponent(s)))].join('/');
  return `${baseUrl}/storage/v1/object/public/blog-uploads/${objectPath}`;
}

async function proxyStorage(request: NextRequest, path: string[]) {
  const url = storageUrl(path);
  if (!url) {
    return new NextResponse(null, { status: 404 });
  }

  const fetchHeaders: Record<string, string> = {};
  const range = request.headers.get('range');
  if (range) {
    fetchHeaders['range'] = range;
  }

  const res = await fetch(url, {
    method: request.method,
    headers: fetchHeaders,
  });

  if (!res.ok) {
    return new NextResponse(null, { status: res.status });
  }

  const headers = new Headers(res.headers);
  headers.delete('x-robots-tag');
  headers.delete('set-cookie');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');

  return new NextResponse(request.method === 'HEAD' ? null : res.body, {
    status: res.status,
    headers,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyStorage(request, path);
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyStorage(request, path);
}
