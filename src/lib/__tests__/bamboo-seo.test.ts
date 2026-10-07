import { 
  normalizeSlug, 
  validateAndNormalizeAiResponse, 
  generateFallbackSeo, 
  stripHtml,
  calculateContentHash 
} from '../bamboo-seo';
import assert from 'assert';

console.log('Running Bamboo SEO unit tests...');

// 1. normalizeSlug 테스트
assert.strictEqual(normalizeSlug('Communication Checklist!', 582), 'communication-checklist');
assert.strictEqual(normalizeSlug('  Hello__World  123  ', 582), 'hello-world-123');
assert.strictEqual(normalizeSlug('한글 슬러그 비포맷', 582), 'post-582');
assert.strictEqual(normalizeSlug('', 582), 'post-582');
console.log('✓ normalizeSlug tests passed');

// 2. stripHtml & calculateContentHash 테스트
assert.strictEqual(stripHtml('<p>Hello <strong>World</strong>!</p>'), 'Hello World!');
const hash1 = calculateContentHash('Hello World');
const hash2 = calculateContentHash('Hello World');
assert.strictEqual(hash1, hash2);
console.log('✓ stripHtml and calculateContentHash tests passed');

// 3. generateFallbackSeo 테스트
const fallback = generateFallbackSeo(100, '이것은 짧은 테스트 글입니다. 두번째 문장입니다.');
assert.strictEqual(fallback.seoStatus, 'failed');
assert.strictEqual(fallback.seoData.slug, 'post-100');
assert.strictEqual(fallback.seoData.indexable, true);
assert.strictEqual(fallback.seoData.seoTitle, '이것은 짧은 테스트 글입니다.');

const shortFallback = generateFallbackSeo(101, '짧은글', 'skipped');
assert.strictEqual(shortFallback.seoStatus, 'skipped');
assert.strictEqual(shortFallback.seoData.indexable, false);
console.log('✓ generateFallbackSeo tests passed');

// 4. validateAndNormalizeAiResponse 테스트
const validAiInput = {
  seoTitle: '<b>커뮤니케이션</b> 팁 3가지',
  slug: 'Communication_Checklist_2026!',
  metaTitle: '커뮤니케이션 팁 3가지 | Bright Notes',
  metaDescription: '커뮤니케이션에 대한 설명입니다.',
  metaKeywords: ['커뮤니케이션', '소통', '커뮤니케이션', '#직장생활'],
  summary: '1~2문장 요약입니다.',
  category: '직장생활',
  tags: ['소통', '직장생활', '소통'],
  indexable: true
};

const normalized = validateAndNormalizeAiResponse(validAiInput, 582);
assert.strictEqual(normalized.seoTitle, '커뮤니케이션 팁 3가지');
assert.strictEqual(normalized.slug, 'communication-checklist-2026');
assert.deepStrictEqual(normalized.metaKeywords, ['커뮤니케이션', '소통', '직장생활']);
assert.deepStrictEqual(normalized.tags, ['소통', '직장생활']);
assert.strictEqual(normalized.category, '직장생활');
assert.strictEqual(normalized.indexable, true);
console.log('✓ validateAndNormalizeAiResponse tests passed');

// 5. evaluateBambooPostQuality & isMigrationTarget & isRetryableError 테스트
import { evaluateBambooPostQuality, isRetryableError } from '../bamboo-seo';
import { isMigrationTarget } from '../bamboo-seo-migration';

// Quality tests
assert.strictEqual(evaluateBambooPostQuality('짧은 글입니다').indexable, false);
assert.strictEqual(evaluateBambooPostQuality('이것은 충분히 긴 정상적인 게시글입니다. 직장생활 커뮤니케이션 팁입니다.').indexable, true);
assert.strictEqual(evaluateBambooPostQuality('ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ').indexable, false);
assert.strictEqual(evaluateBambooPostQuality('test1234').indexable, false);
assert.strictEqual(evaluateBambooPostQuality('카톡아이디 baccarat1234 강남토토').indexable, false);
console.log('✓ evaluateBambooPostQuality tests passed');

// Target selection tests
assert.strictEqual(isMigrationTarget({ deleted_at: '2026-01-01' }).target, false); // Deleted post
assert.strictEqual(isMigrationTarget({ manual_override: true }).target, false); // Manual override
assert.strictEqual(isMigrationTarget({ seo_locked: true }).target, false); // Locked
assert.strictEqual(isMigrationTarget({ seo_status: 'completed', seo_title: 'Title', slug: 'post-1', meta_title: 'MTitle', meta_description: 'MDesc' }).target, false); // Already completed
assert.strictEqual(isMigrationTarget({ seo_status: 'completed', seo_title: 'Title', slug: 'post-1', meta_title: 'MTitle', meta_description: 'MDesc' }, true).target, true); // Force all
assert.strictEqual(isMigrationTarget({ seo_status: 'pending' }).target, true); // Pending post
console.log('✓ isMigrationTarget tests passed');

// Error retryable tests
assert.strictEqual(isRetryableError('HTTP 429: Too Many Requests'), true);
assert.strictEqual(isRetryableError('OpenAI API 호출 시간 초과 (15초)'), true);
assert.strictEqual(isRetryableError('OpenAI 응답 본문이 비어있습니다.'), false);
console.log('✓ isRetryableError tests passed');

console.log('ALL BAMBOO SEO UNIT TESTS PASSED SUCCESSFULLY!');
