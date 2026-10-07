-- Rollback Script for Bamboo Posts SEO Migration
-- 이 스크립트는 마이그레이션 실행 전 상태로 bamboo_posts SEO 메타데이터를 복구 또는 초기화할 때 사용합니다.

-- 1. AI 생성 SEO 데이터를 'pending' 상태로 되돌리고 생성된 메타데이터만 초기화 (원문/댓글/좋아요 데이터는 보존)
UPDATE bamboo_posts
SET seo_status = 'pending',
    seo_title = NULL,
    slug = 'post-' || id,
    meta_title = NULL,
    meta_description = NULL,
    meta_keywords = NULL,
    summary = NULL,
    category = '일상',
    tags = NULL,
    ai_generated_at = NULL,
    ai_model = NULL,
    ai_error = NULL,
    ai_retry_count = 0,
    ai_last_attempt_at = NULL
WHERE manual_override = false AND seo_locked = false;

-- 2. 실패(failed) 및 진행 중(processing) 상태 건만 pending으로 개별 리셋하는 경우
-- UPDATE bamboo_posts SET seo_status = 'pending', ai_error = NULL WHERE seo_status IN ('failed', 'processing');

-- 3. 백업 JSON 파일로부터 복구하는 방법:
-- node scripts/restore_bamboo_posts.js backups/bamboo_posts_backup_<timestamp>.json
