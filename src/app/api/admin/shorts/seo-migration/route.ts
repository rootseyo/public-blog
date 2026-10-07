import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  runDryRun,
  getBambooSeoMigrationStatus,
  executeBambooSeoMigration
} from '@/lib/bamboo-seo-migration';
import { query } from '@/lib/db';
import { verifyAdminSession } from '@/lib/admin-session';

async function checkAdminAuth(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  if (verifyAdminSession(cookieStore.get('admin_session')?.value)) return true;

  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const adminSecret = process.env.ADMIN_SECRET || process.env.ADMIN_API_KEY;
    if (adminSecret && token === adminSecret) return true;
  }

  return false;
}

/**
 * GET: 마이그레이션 상태 및 통계 조회 (Requirement 10)
 */
export async function GET(req: NextRequest) {
  const isAuth = await checkAdminAuth(req);
  if (!isAuth) {
    return NextResponse.json({ error: '관리자 권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const exportFormat = searchParams.get('export');

  if (exportFormat === 'csv' || exportFormat === 'json') {
    const postsRes = await query(
      `SELECT id, author_name, seo_title, slug, meta_title, meta_description, summary, category, tags, seo_status, indexable, ai_generated_at, ai_model, ai_error, ai_retry_count, manual_override, seo_locked, created_at 
       FROM bamboo_posts ORDER BY id ASC`
    );

    if (exportFormat === 'csv') {
      const headers = ['id', 'seo_title', 'slug', 'meta_title', 'seo_status', 'indexable', 'ai_error', 'created_at'];
      const csvRows = [headers.join(',')];

      for (const row of postsRes.rows) {
        const line = [
          row.id,
          `"${String(row.seo_title || '').replace(/"/g, '""')}"`,
          `"${String(row.slug || '').replace(/"/g, '""')}"`,
          `"${String(row.meta_title || '').replace(/"/g, '""')}"`,
          row.seo_status,
          row.indexable,
          `"${String(row.ai_error || '').replace(/"/g, '""')}"`,
          row.created_at
        ].join(',');
        csvRows.push(line);
      }

      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="shorts_seo_migration_${Date.now()}.csv"`
        }
      });
    }

    return NextResponse.json({ posts: postsRes.rows });
  }

  const stats = await getBambooSeoMigrationStatus();
  return NextResponse.json({ success: true, stats });
}

/**
 * POST: 마이그레이션 실행, dry-run, 재시도, 제어 (Requirement 9, 10)
 */
export async function POST(req: NextRequest) {
  const isAuth = await checkAdminAuth(req);
  if (!isAuth) {
    return NextResponse.json({ error: '관리자 권한이 없습니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const isDryRunParam = searchParams.get('dryRun') === 'true';

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch (e) {
    // Body can be empty for query params POST
  }

  const isDryRun = isDryRunParam || Boolean(body.dryRun);
  const action = body.action || searchParams.get('action') || (isDryRun ? 'dryRun' : 'start');
  const batchSize = body.batchSize || parseInt(searchParams.get('batchSize') || '10', 10);
  const postId = body.postId ? parseInt(body.postId, 10) : undefined;
  const forceAll = Boolean(body.forceAll || searchParams.get('forceAll') === 'true');

  if (isDryRun || action === 'dryRun') {
    const dryRunResult = await runDryRun({
      batchSize,
      forceAll,
      targetPostId: postId
    });
    return NextResponse.json({
      success: true,
      dryRun: true,
      data: dryRunResult
    });
  }

  if (action === 'start' || action === 'resume') {
    const result = await executeBambooSeoMigration({
      batchSize,
      forceAll,
      targetPostId: postId
    });
    return NextResponse.json(result);
  }

  if (action === 'retry-failed') {
    const result = await executeBambooSeoMigration({
      batchSize,
      retryFailedOnly: true,
      targetPostId: postId
    });
    return NextResponse.json(result);
  }

  if (action === 'retry-single' && postId) {
    const result = await executeBambooSeoMigration({
      batchSize: 1,
      targetPostId: postId,
      forceAll: true
    });
    return NextResponse.json(result);
  }

  if (action === 'force-all') {
    const result = await executeBambooSeoMigration({
      batchSize,
      forceAll: true
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: '지원되지 않는 액션입니다.' }, { status: 400 });
}
