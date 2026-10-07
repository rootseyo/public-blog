import app from './.open-next/worker.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // 1. ref / rank 쿼리 파라미터가 있는 경우 클린 URL로 301 영구 이동
    if (url.searchParams.has('ref') || url.searchParams.has('rank')) {
      url.searchParams.delete('ref');
      url.searchParams.delete('rank');
      return Response.redirect(url.toString(), 301);
    }

    // 2. /uploads/ 이미지 프록시 (307 리디렉션 제거, x-robots-tag: none 제거, 200 OK 제공 및 엣지 캐싱)
    if (url.pathname.startsWith('/uploads/')) {
      const relativePath = url.pathname.replace(/^\/uploads\//, '');
      const rawSegments = relativePath.split('/').filter(Boolean);

      if (!rawSegments.length || rawSegments.some((s) => s === '.' || s === '..')) {
        return new Response('Not Found', { status: 404 });
      }

      const cache = typeof caches !== 'undefined' ? caches.default : null;
      if (request.method === 'GET' && cache) {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
      }

      const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
      if (!baseUrl) return new Response('Storage is not configured', { status: 503 });
      const encodedPath = ['uploads', ...rawSegments.map((s) => encodeURIComponent(decodeURIComponent(s)))].join('/');
      const storageUrl = `${baseUrl}/storage/v1/object/public/blog-uploads/${encodedPath}`;

      const fetchHeaders = new Headers();
      const range = request.headers.get('range');
      if (range) {
        fetchHeaders.set('range', range);
      }

      const storageResponse = await fetch(storageUrl, {
        method: request.method,
        headers: fetchHeaders,
      });

      if (!storageResponse.ok) {
        return new Response('Not Found', { status: storageResponse.status });
      }

      const headers = new Headers(storageResponse.headers);
      headers.delete('x-robots-tag');
      headers.delete('set-cookie');
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      headers.set('access-control-allow-origin', '*');

      const response = new Response(request.method === 'HEAD' ? null : storageResponse.body, {
        status: storageResponse.status,
        headers,
      });

      if (request.method === 'GET' && cache && ctx?.waitUntil) {
        ctx.waitUntil(cache.put(request, response.clone()));
      }

      return response;
    }

    return app.fetch(request, env, ctx);
  },

  scheduled(controller, env, ctx) {
    if (!env.CRON_SECRET) {
      console.error('[Cron] CRON_SECRET is not configured.');
      return;
    }

    const url = new URL('https://cron.internal/api/cron/indexnow');
    url.searchParams.set('secret', env.CRON_SECRET);
    ctx.waitUntil(
      app.fetch(new Request(url), env, ctx).then((response) => {
        if (!response.ok) throw new Error(`[Cron] Internal route failed: ${response.status}`);
      })
    );
  },
};
