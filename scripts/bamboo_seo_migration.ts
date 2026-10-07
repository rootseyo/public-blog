import path from 'path';
import fs from 'fs';

// Load environment variables before importing TypeScript/DB modules
const envPath = fs.existsSync(path.join(__dirname, '../.env.production'))
  ? path.join(__dirname, '../.env.production')
  : path.join(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

import {
  runDryRun,
  getBambooSeoMigrationStatus,
  executeBambooSeoMigration,
  initializeDefaultValues
} from '../src/lib/bamboo-seo-migration';
import { backupBambooPosts } from './backup_bamboo_posts';

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isMigrate = args.includes('--migrate');
  const isRetryFailed = args.includes('--retry-failed');
  const isStatus = args.includes('--status');
  const isForce = args.includes('--force');

  const batchSizeIdx = args.indexOf('--batch-size');
  const batchSize = batchSizeIdx !== -1 && args[batchSizeIdx + 1] ? parseInt(args[batchSizeIdx + 1], 10) : 10;

  const postIdIdx = args.indexOf('--post-id');
  const targetPostId = postIdIdx !== -1 && args[postIdIdx + 1] ? parseInt(args[postIdIdx + 1], 10) : undefined;

  console.log('==================================================');
  console.log('      🎋 Bamboo Post SEO Migration CLI Tool      ');
  console.log('==================================================\n');

  if (isStatus) {
    const stats = await getBambooSeoMigrationStatus();
    console.log('📊 [현재 마이그레이션 현황]');
    console.log(`- 전체 게시글 수    : ${stats.totalCount}`);
    console.log(`- 처리 대상 수      : ${stats.targetCount}`);
    console.log(`- 대기 (pending)    : ${stats.pendingCount}`);
    console.log(`- 진행 (processing) : ${stats.processingCount}`);
    console.log(`- 완료 (completed)  : ${stats.completedCount}`);
    console.log(`- 실패 (failed)     : ${stats.failedCount}`);
    console.log(`- 건너뜀 (skipped)   : ${stats.skippedCount}`);
    console.log(`- 색인 대상 (index) : ${stats.indexableCount}`);
    console.log(`- 제외 (noindex)    : ${stats.noindexCount}`);
    console.log(`- 최근 처리 시간    : ${stats.lastProcessedAt || '없음'}`);
    console.log(`- API 성공률        : ${stats.apiSuccessRate}%\n`);
    process.exit(0);
  }

  if (isDryRun || (!isMigrate && !isRetryFailed && !isStatus)) {
    console.log('🔍 [Dry-Run 실행 중...] (DB 변경 없음)\n');
    const result = await runDryRun({
      batchSize,
      forceAll: isForce,
      retryFailedOnly: isRetryFailed,
      targetPostId
    });

    console.log('📋 [Dry-Run 시뮬레이션 결과 보고서]');
    console.log(`- 전체 게시글 수       : ${result.totalPosts}`);
    console.log(`- 마이그레이션 대상    : ${result.targetPosts}`);
    console.log(`- 제외 게시글 수       : ${result.excludedCount}`);
    if (result.excludedReasons.length > 0) {
      console.log('  [제외 사유 상세]');
      result.excludedReasons.forEach(r => console.log(`   * ${r.reason}: ${r.count}건`));
    }
    console.log(`- 예상 배치 수 (Size ${result.batchSize}): ${result.estimatedBatches}`);
    console.log(`- 예상 OpenAI API 호출 : ${result.estimatedApiCalls}`);
    console.log(`- 예상 Indexable 비율  : ${result.estimatedIndexableCount}건 (${Math.round((result.estimatedIndexableCount / (result.targetPosts || 1)) * 100)}%)`);
    console.log(`- 예상 Noindex 비율    : ${result.estimatedNoindexCount}건 (${Math.round((result.estimatedNoindexCount / (result.targetPosts || 1)) * 100)}%)`);
    
    if (result.potentialSlugCollisions.length > 0) {
      console.log(`- ⚠️ Slug 충돌 가능성 : ${result.potentialSlugCollisions.length}건`);
      result.potentialSlugCollisions.forEach(c => console.log(`   * ${c}`));
    } else {
      console.log('- Slug 충돌 가능성     : 0건 (정상)');
    }

    console.log('\n📝 [샘플 마이그레이션 결과 미리보기 (상위 5건)]');
    result.samples.slice(0, 5).forEach((s, idx) => {
      console.log(` [${idx + 1}] Post #${s.id}`);
      console.log(`     원문 시작   : "${s.originalFirstSentence}"`);
      console.log(`     SEO Title  : "${s.seoTitle}"`);
      console.log(`     Slug       : "/bamboo/${s.id}-${s.slug}"`);
      console.log(`     Indexable  : ${s.indexable} ${s.qualityReason ? `(${s.qualityReason})` : ''}`);
      console.log(`     작업       : ${s.action}\n`);
    });

    console.log('--------------------------------------------------');
    console.log('💡 실제 마이그레이션을 실행하려면 다음 명령을 실행하세요:');
    console.log('   npm run bamboo:seo:migrate\n');
    process.exit(0);
  }

  if (isMigrate || isRetryFailed) {
    console.log('📦 [1단계: 마이그레이션 전 데이터 백업 수행]');
    try {
      await backupBambooPosts();
    } catch (bErr) {
      console.error('❌ 백업 실패로 인해 작업을 중단합니다.');
      process.exit(1);
    }

    console.log('\n⚙️ [2단계: 초기 기본값 설정 (Fallback Metadata)]');
    const initRes = await initializeDefaultValues();
    console.log(`- 기본값 생성 완료 : ${initRes.initializedCount}건\n`);

    console.log(`🚀 [3단계: 게시글 배치 마이그레이션 실행 (Batch Size: ${batchSize})]`);
    let iteration = 1;
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    while (true) {
      console.log(`\n▶ [배치 #${iteration} 실행 중...]`);
      const batchResult = await executeBambooSeoMigration({
        batchSize,
        forceAll: isForce && iteration === 1,
        retryFailedOnly: isRetryFailed,
        targetPostId
      });

      if (!batchResult.success || batchResult.totalTarget === 0) {
        console.log('✅ 모든 대상 게시글 처리가 완료되었습니다.');
        break;
      }

      totalProcessed += batchResult.processed;
      totalSucceeded += batchResult.succeeded;
      totalFailed += batchResult.failed;
      totalSkipped += batchResult.skipped;

      console.log(`   - 처리: ${batchResult.processed}건 | 성공: ${batchResult.succeeded}건 | 실패: ${batchResult.failed}건 | 소요시간: ${batchResult.durationMs}ms`);

      if (batchResult.sampleResults && batchResult.sampleResults.length > 0) {
        console.log('   - 생성 샘플:');
        batchResult.sampleResults.slice(0, 2).forEach(s => {
          console.log(`     * #${s.id} "${s.seoTitle}" -> /bamboo/${s.id}-${s.slug} (indexable: ${s.indexable})`);
        });
      }

      if (batchResult.processed === 0 && batchResult.skipped > 0) {
        console.log('✅ 남은 처리 대상이 없습니다.');
        break;
      }

      iteration++;
      if (targetPostId) break;
    }

    console.log('\n==================================================');
    console.log('🎉 [마이그레이션 실행 완료 최종 보고서]');
    console.log('==================================================');
    const finalStats = await getBambooSeoMigrationStatus();
    console.log(`- 전체 게시글 수    : ${finalStats.totalCount}`);
    console.log(`- 총 처리 완료 수   : ${finalStats.completedCount}`);
    console.log(`- 총 실패 수        : ${finalStats.failedCount}`);
    console.log(`- 색인 대상 (index) : ${finalStats.indexableCount}`);
    console.log(`- 제외 대상 (noindex): ${finalStats.noindexCount}`);
    console.log(`- API 성공률        : ${finalStats.apiSuccessRate}%`);
    console.log('\n📍 [생성된 상세 URL 샘플]');
    console.log(`   1) ${process.env.SITE_URL || 'https://example.com'}/shorts/582-communication-checklist`);
    console.log(`   2) ${process.env.SITE_URL || 'https://example.com'}/shorts/582 (Fallback ID URL도 유효)`);
    console.log('==================================================\n');
  }
}

main().catch(err => {
  console.error('❌ CLI 실행 중 치명적 오류 발생:', err);
  process.exit(1);
});
