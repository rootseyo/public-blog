import { query } from '@/lib/db';
import {
  generateBambooSeoWithOpenAI,
  generateFallbackSeo,
  evaluateBambooPostQuality,
  isRetryableError,
  stripHtml,
  normalizeSlug,
  calculateContentHash,
  BambooSeoData
} from '@/lib/bamboo-seo';
import { ensureBambooSeoColumns } from '@/app/(main)/shorts/actions';
import { revalidatePath } from 'next/cache';

export interface MigrationOptions {
  dryRun?: boolean;
  batchSize?: number;
  forceAll?: boolean;
  retryFailedOnly?: boolean;
  targetPostId?: number;
  maxRetries?: number;
}

export interface ExcludedReasonCount {
  reason: string;
  count: number;
}

export interface MigrationSampleItem {
  id: number;
  originalFirstSentence: string;
  seoTitle: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  indexable: boolean;
  qualityReason?: string;
  action: string;
}

export interface DryRunResult {
  totalPosts: number;
  targetPosts: number;
  excludedCount: number;
  excludedReasons: ExcludedReasonCount[];
  estimatedApiCalls: number;
  estimatedBatches: number;
  batchSize: number;
  estimatedIndexableCount: number;
  estimatedNoindexCount: number;
  potentialSlugCollisions: string[];
  fieldsToUpdate: string[];
  samples: MigrationSampleItem[];
}

export interface MigrationStats {
  totalCount: number;
  targetCount: number;
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  indexableCount: number;
  noindexCount: number;
  lastProcessedAt: string | null;
  avgProcessingTimeMs: number;
  apiSuccessRate: number;
}

export interface MigrationBatchResult {
  success: boolean;
  dryRun: boolean;
  totalTarget: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  indexable: number;
  noindex: number;
  durationMs: number;
  sampleResults?: MigrationSampleItem[];
  dryRunDetails?: DryRunResult;
  error?: string;
}

/**
 * 마이그레이션 대상 여부 판단 (Requirement 1)
 */
export function isMigrationTarget(post: {
  deleted_at?: string | null;
  manual_override?: boolean;
  seo_locked?: boolean;
  seo_status?: string | null;
  seo_title?: string | null;
  slug?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
}, forceAll = false, retryFailedOnly = false): { target: boolean; reason?: string } {
  if (post.deleted_at) {
    return { target: false, reason: '삭제된 게시글' };
  }

  if (post.manual_override || post.seo_locked) {
    return { target: false, reason: '수동 관리 또는 SEO 잠금 상태 (manual_override/seo_locked)' };
  }

  if (retryFailedOnly) {
    if (post.seo_status === 'failed') {
      return { target: true };
    }
    return { target: false, reason: '실패 상태 아님 (retryFailedOnly 모드)' };
  }

  if (forceAll) {
    return { target: true };
  }

  const isCompleted = post.seo_status === 'completed';
  const hasAllRequired = Boolean(post.seo_title && post.slug && post.meta_title && post.meta_description);

  if (isCompleted && hasAllRequired) {
    return { target: false, reason: '이미 SEO 완료 및 필수 필드 존재 (completed)' };
  }

  return { target: true };
}

/**
 * 초기 기본값 설정 및 백필 (Requirement 4)
 */
export async function initializeDefaultValues(): Promise<{ initializedCount: number }> {
  await ensureBambooSeoColumns();

  const res = await query(
    `SELECT id, content, seo_title, slug, meta_title, meta_description, summary, indexable, seo_status, manual_override, seo_locked, deleted_at 
     FROM bamboo_posts 
     WHERE deleted_at IS NULL 
       AND (seo_status IS NULL OR seo_status = '' OR seo_title IS NULL OR slug IS NULL OR meta_title IS NULL)`
  );

  let initializedCount = 0;

  for (const post of res.rows) {
    const { target } = isMigrationTarget(post);
    if (!target) continue;

    const fallback = generateFallbackSeo(post.id, post.content, 'failed');
    const seoTitle = post.seo_title || fallback.seoData.seoTitle;
    const slug = post.slug || `post-${post.id}`;
    const metaTitle = post.meta_title || fallback.seoData.metaTitle;
    const metaDescription = post.meta_description || fallback.seoData.metaDescription;
    const summary = post.summary || fallback.seoData.summary;
    const indexable = post.indexable !== undefined && post.indexable !== null ? post.indexable : fallback.seoData.indexable;
    const status = post.seo_status && post.seo_status !== 'processing' ? post.seo_status : 'pending';

    await query(
      `UPDATE bamboo_posts 
       SET seo_status = $1,
           seo_title = COALESCE(seo_title, $2),
           slug = COALESCE(slug, $3),
           meta_title = COALESCE(meta_title, $4),
           meta_description = COALESCE(meta_description, $5),
           summary = COALESCE(summary, $6),
           indexable = COALESCE(indexable, $7)
       WHERE id = $8 AND (seo_status IS NULL OR seo_status = 'pending')`,
      [status, seoTitle, slug, metaTitle, metaDescription, summary, indexable, post.id]
    );

    initializedCount++;
  }

  return { initializedCount };
}

/**
 * Dry-run 모드 검사 실행 (Requirement 9)
 */
export async function runDryRun(options: MigrationOptions = {}): Promise<DryRunResult> {
  await ensureBambooSeoColumns();

  const batchSize = options.batchSize || parseInt(process.env.SEO_MIGRATION_BATCH_SIZE || '10', 10);
  const forceAll = Boolean(options.forceAll);
  const retryFailedOnly = Boolean(options.retryFailedOnly);

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  if (options.targetPostId) {
    whereClause += ' AND id = $1';
    params.push(options.targetPostId);
  }

  const res = await query(
    `SELECT id, content, seo_title, slug, meta_title, meta_description, summary, category, tags, seo_status, indexable, manual_override, seo_locked, deleted_at, ai_retry_count 
     FROM bamboo_posts ${whereClause} ORDER BY id ASC`,
    params
  );

  const totalPosts = res.rows.length;
  let targetPosts = 0;
  let excludedCount = 0;
  const reasonMap: Record<string, number> = {};
  const samples: MigrationSampleItem[] = [];
  const slugSet = new Set<string>();
  const potentialSlugCollisions: string[] = [];

  let estimatedIndexableCount = 0;
  let estimatedNoindexCount = 0;

  for (const post of res.rows) {
    const { target, reason } = isMigrationTarget(post, forceAll, retryFailedOnly);

    if (!target) {
      excludedCount++;
      const r = reason || '기타';
      reasonMap[r] = (reasonMap[r] || 0) + 1;
      continue;
    }

    targetPosts++;
    const quality = evaluateBambooPostQuality(post.content);
    if (quality.indexable) {
      estimatedIndexableCount++;
    } else {
      estimatedNoindexCount++;
    }

    const fallback = generateFallbackSeo(post.id, post.content);
    const plain = stripHtml(post.content);
    const firstSentence = plain.split(/[.!?\n]/)[0]?.trim() || `익명 게시글 #${post.id}`;

    const expectedSlug = post.slug || `post-${post.id}`;
    if (slugSet.has(expectedSlug)) {
      potentialSlugCollisions.push(`ID ${post.id}: slug 충돌 가능성 (${expectedSlug})`);
    } else {
      slugSet.add(expectedSlug);
    }

    if (samples.length < 10) {
      samples.push({
        id: post.id,
        originalFirstSentence: firstSentence.slice(0, 45),
        seoTitle: post.seo_title || fallback.seoData.seoTitle,
        slug: expectedSlug,
        metaTitle: post.meta_title || fallback.seoData.metaTitle,
        metaDescription: post.meta_description || fallback.seoData.metaDescription,
        indexable: quality.indexable,
        qualityReason: quality.reason,
        action: post.seo_status === 'failed' ? '재시도 처리 예정' : 'OpenAI SEO 생성 예정'
      });
    }
  }

  const excludedReasons: ExcludedReasonCount[] = Object.entries(reasonMap).map(([reason, count]) => ({
    reason,
    count
  }));

  const estimatedApiCalls = targetPosts;
  const estimatedBatches = Math.ceil(targetPosts / batchSize);

  return {
    totalPosts,
    targetPosts,
    excludedCount,
    excludedReasons,
    estimatedApiCalls,
    estimatedBatches,
    batchSize,
    estimatedIndexableCount,
    estimatedNoindexCount,
    potentialSlugCollisions,
    fieldsToUpdate: [
      'seo_title',
      'slug',
      'meta_title',
      'meta_description',
      'meta_keywords',
      'summary',
      'category',
      'tags',
      'seo_status',
      'indexable',
      'ai_generated_at',
      'ai_model',
      'ai_error',
      'ai_retry_count',
      'ai_last_attempt_at'
    ],
    samples
  };
}

/**
 * 전체 마이그레이션 현황 통계 조회 (Requirement 10)
 */
export async function getBambooSeoMigrationStatus(): Promise<MigrationStats> {
  await ensureBambooSeoColumns();

  const totalRes = await query('SELECT COUNT(*) FROM bamboo_posts');
  const totalCount = parseInt(totalRes.rows[0].count, 10);

  const statusRes = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND (manual_override = true OR seo_locked = true)) as manual_locked,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND (seo_status = 'pending' OR seo_status IS NULL)) as pending,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND seo_status = 'processing') as processing,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND seo_status = 'completed') as completed,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND seo_status = 'failed') as failed,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND seo_status = 'skipped') as skipped,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND indexable = true) as indexable,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND indexable = false) as noindex,
      MAX(ai_generated_at) as last_processed,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted
    FROM bamboo_posts
  `);

  const row = statusRes.rows[0];
  const pendingCount = parseInt(row.pending || '0', 10);
  const processingCount = parseInt(row.processing || '0', 10);
  const completedCount = parseInt(row.completed || '0', 10);
  const failedCount = parseInt(row.failed || '0', 10);
  const skippedCount = parseInt(row.skipped || '0', 10);
  const indexableCount = parseInt(row.indexable || '0', 10);
  const noindexCount = parseInt(row.noindex || '0', 10);
  const lastProcessedAt = row.last_processed ? new Date(row.last_processed).toISOString() : null;

  const targetCount = pendingCount + processingCount + failedCount;

  const totalAttempted = completedCount + failedCount;
  const apiSuccessRate = totalAttempted > 0 ? Math.round((completedCount / totalAttempted) * 100) : 100;

  return {
    totalCount,
    targetCount,
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
    skippedCount,
    indexableCount,
    noindexCount,
    lastProcessedAt,
    avgProcessingTimeMs: 1200, // Estimated per API call average
    apiSuccessRate
  };
}

/**
 * 단일 배치 또는 전체 마이그레이션 실행 (Requirement 6, 7, 10)
 */
export async function executeBambooSeoMigration(options: MigrationOptions = {}): Promise<MigrationBatchResult> {
  const startTime = Date.now();
  await ensureBambooSeoColumns();

  const dryRun = Boolean(options.dryRun);
  const batchSize = options.batchSize || parseInt(process.env.SEO_MIGRATION_BATCH_SIZE || '10', 10);
  const maxRetries = options.maxRetries || parseInt(process.env.SEO_AI_MAX_RETRIES || '3', 10);
  const forceAll = Boolean(options.forceAll);
  const retryFailedOnly = Boolean(options.retryFailedOnly);

  if (dryRun) {
    const dryRunData = await runDryRun(options);
    return {
      success: true,
      dryRun: true,
      totalTarget: dryRunData.targetPosts,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: dryRunData.excludedCount,
      indexable: dryRunData.estimatedIndexableCount,
      noindex: dryRunData.estimatedNoindexCount,
      durationMs: Date.now() - startTime,
      sampleResults: dryRunData.samples,
      dryRunDetails: dryRunData
    };
  }

  // 1. 초기 기본값 세팅 실행 (Fallback 보장)
  await initializeDefaultValues();

  // 2. 대상 쿼리 조건 설정
  let whereClause = 'WHERE deleted_at IS NULL AND manual_override = false AND seo_locked = false';
  const params: any[] = [];

  if (options.targetPostId) {
    whereClause += ' AND id = $' + (params.length + 1);
    params.push(options.targetPostId);
  } else if (retryFailedOnly) {
    whereClause += " AND seo_status = 'failed'";
  } else if (!forceAll) {
    whereClause += " AND (seo_status IS NULL OR seo_status IN ('pending', 'failed') OR seo_title IS NULL OR slug IS NULL)";
  }

  const postsQuery = `
    SELECT id, content, seo_title, slug, meta_title, meta_description, seo_status, ai_retry_count, indexable, manual_override, seo_locked, deleted_at 
    FROM bamboo_posts 
    ${whereClause} 
    ORDER BY id ASC 
    LIMIT $${params.length + 1}
  `;
  params.push(batchSize);

  const postsRes = await query(postsQuery, params);
  const candidatePosts = postsRes.rows;

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let indexableCount = 0;
  let noindexCount = 0;
  const samples: MigrationSampleItem[] = [];

  for (const post of candidatePosts) {
    const { target, reason } = isMigrationTarget(post, forceAll, retryFailedOnly);
    if (!target) {
      skipped++;
      continue;
    }

    // 3. Atomic processing Lock (Requirement 6)
    const lockRes = await query(
      `UPDATE bamboo_posts 
       SET seo_status = 'processing', 
           ai_last_attempt_at = CURRENT_TIMESTAMP 
       WHERE id = $1 
         AND (seo_status != 'processing' OR ai_last_attempt_at < NOW() - INTERVAL '10 minutes')
       RETURNING id`,
      [post.id]
    );

    if (lockRes.rows.length === 0) {
      console.log(`[Bamboo Migration] Post ${post.id} already being processed by another worker. Skipping.`);
      skipped++;
      continue;
    }

    processed++;

    try {
      // 4. OpenAI API 호출로 메타데이터 생성
      const result = await generateBambooSeoWithOpenAI(post.id, post.content);

      if (result.seoStatus === 'completed') {
        succeeded++;
        if (result.seoData.indexable) indexableCount++;
        else noindexCount++;

        const contentHash = calculateContentHash(post.content);

        await query(
          `UPDATE bamboo_posts 
           SET seo_title = $1,
               slug = $2,
               meta_title = $3,
               meta_description = $4,
               meta_keywords = $5,
               summary = $6,
               category = $7,
               tags = $8,
               seo_status = 'completed',
               indexable = $9,
               ai_generated_at = CURRENT_TIMESTAMP,
               ai_model = $10,
               ai_error = NULL,
               content_hash = $11
           WHERE id = $12`,
          [
            result.seoData.seoTitle,
            result.seoData.slug,
            result.seoData.metaTitle,
            result.seoData.metaDescription,
            result.seoData.metaKeywords,
            result.seoData.summary,
            result.seoData.category,
            result.seoData.tags,
            result.seoData.indexable,
            result.aiModel || 'gpt-4o-mini',
            contentHash,
            post.id
          ]
        );

        if (samples.length < 5) {
          samples.push({
            id: post.id,
            originalFirstSentence: stripHtml(post.content).slice(0, 45),
            seoTitle: result.seoData.seoTitle,
            slug: result.seoData.slug,
            metaTitle: result.seoData.metaTitle,
            metaDescription: result.seoData.metaDescription,
            indexable: result.seoData.indexable,
            action: '성공 (completed)'
          });
        }
      } else {
        // 실패 처리 및 재시도 정책 (Requirement 7)
        failed++;
        const currentRetryCount = Number(post.ai_retry_count || 0) + 1;
        const retryable = isRetryableError(result.aiError);

        if (retryable && currentRetryCount < maxRetries) {
          await query(
            `UPDATE bamboo_posts 
             SET seo_status = 'pending', 
                 ai_retry_count = $1, 
                 ai_error = $2 
             WHERE id = $3`,
            [currentRetryCount, result.aiError || 'Temporary AI Error', post.id]
          );
        } else {
          await query(
            `UPDATE bamboo_posts 
             SET seo_status = 'failed', 
                 ai_retry_count = $1, 
                 ai_error = $2 
             WHERE id = $3`,
            [currentRetryCount, result.aiError || 'Permanent AI Processing Error', post.id]
          );
        }
      }
    } catch (err: unknown) {
      failed++;
      const errorMessage = (err as Error)?.message || String(err);
      const currentRetryCount = Number(post.ai_retry_count || 0) + 1;
      const retryable = isRetryableError(errorMessage);

      await query(
        `UPDATE bamboo_posts 
         SET seo_status = $1, 
             ai_retry_count = $2, 
             ai_error = $3 
         WHERE id = $4`,
        [retryable && currentRetryCount < maxRetries ? 'pending' : 'failed', currentRetryCount, errorMessage, post.id]
      );
    }
  }

  // 캐시 무효화
  try {
    revalidatePath('/bamboo');
    revalidatePath('/sitemap.xml');
  } catch (revalErr) {
    // Ignore context revalidatePath errors in CLI
  }

  return {
    success: true,
    dryRun: false,
    totalTarget: candidatePosts.length,
    processed,
    succeeded,
    failed,
    skipped,
    indexable: indexableCount,
    noindex: noindexCount,
    durationMs: Date.now() - startTime,
    sampleResults: samples
  };
}
