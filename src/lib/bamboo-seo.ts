import crypto from 'crypto';

export interface BambooSeoData {
  seoTitle: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string[];
  summary: string;
  category: string;
  tags: string[];
  indexable: boolean;
}

export interface BambooSeoResult {
  seoData: BambooSeoData;
  seoStatus: 'completed' | 'failed' | 'skipped';
  aiModel?: string;
  aiError?: string;
}

/**
 * slug 정규화 함수
 */
export function normalizeSlug(value: string, postId: string | number): string {
  if (!value || typeof value !== 'string') {
    return `post-${postId}`;
  }

  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70)
    .replace(/-$/g, '');

  return normalized || `post-${postId}`;
}

/**
 * HTML 태그 제거 및 텍스트 정제
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>?/gm, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 본문 해시 생성 (동일 본문 재사용 및 중복 AI 호출 방지용)
 */
export function calculateContentHash(content: string): string {
  const plain = stripHtml(content);
  return crypto.createHash('sha256').update(plain).digest('hex');
}

/**
 * 게시글 품질 및 indexable 여부 평가 (Requirement 8)
 */
export function evaluateBambooPostQuality(content: string): { indexable: boolean; reason?: string } {
  const plainText = stripHtml(content);
  const trimmed = plainText.trim();
  const nonSpaceLength = trimmed.replace(/\s/g, '').length;

  if (nonSpaceLength < 15) {
    return { indexable: false, reason: '내용이 너무 짧음 (15자 미만)' };
  }

  // 의미 없는 동일 문자 반복 (10회 이상 연속)
  if (/(.)\1{9,}/.test(trimmed)) {
    return { indexable: false, reason: '의미 없는 문자 반복' };
  }

  // 테스트 글 단어 패턴
  if (/^(테스트|test|t3st|12345|asdf)+$/i.test(trimmed.replace(/\s/g, ''))) {
    return { indexable: false, reason: '테스트 게시글' };
  }

  // 광고/스팸성 키워드
  if (/(카톡아이디|텔레그램|바카라|토토|대출상담|수익보장|무료체험)/i.test(trimmed)) {
    return { indexable: false, reason: '광고/스팸 의심 게시글' };
  }

  return { indexable: true };
}

/**
 * 에러의 재시도 가능 여부 판단 (Requirement 7)
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const msg = typeof error === 'string' ? error : (error as Error).message || String(error);

  if (
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('AbortError') ||
    msg.includes('시간 초과') ||
    msg.includes('timeout') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  ) {
    return true;
  }
  return false;
}

/**
 * AI 호출 실패 또는 짧은 글 시 Fallback 메타데이터 생성 (Requirement 5)
 */
export function generateFallbackSeo(postId: number, content: string, status: 'failed' | 'skipped' = 'failed'): BambooSeoResult {
  const plainContent = stripHtml(content);
  
  // 첫 문장 추출 또는 fallback 제목 (35~45자)
  const firstSentenceMatch = plainContent.match(/^[^.!?\n]+[.!?]?/);
  let seoTitle = firstSentenceMatch ? firstSentenceMatch[0].trim().slice(0, 45) : `익명 게시글 #${postId}`;
  if (seoTitle.length < 5) {
    seoTitle = `익명 게시글 #${postId}`;
  }

  const slug = `post-${postId}`;
  const metaTitle = `${seoTitle} | Bright Notes`;
  
  const metaDescription = plainContent.length > 0 
    ? plainContent.slice(0, 140) + (plainContent.length > 140 ? '...' : '')
    : 'Bright Notes 📝 Shorts 게시글입니다.';
    
  const summary = plainContent.length > 0 
    ? plainContent.slice(0, 140) + (plainContent.length > 140 ? '...' : '')
    : 'Bright Notes 📝 Shorts 게시글입니다.';

  const quality = evaluateBambooPostQuality(content);

  return {
    seoData: {
      seoTitle,
      slug,
      metaTitle,
      metaDescription,
      metaKeywords: [],
      summary,
      category: '일상',
      tags: [],
      indexable: quality.indexable,
    },
    seoStatus: status,
    aiModel: 'fallback',
  };
}

/**
 * AI 응답 검증 및 서버 사이드 정규화
 */
export function validateAndNormalizeAiResponse(raw: Record<string, unknown>, postId: number): BambooSeoData {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI 응답이 올바른 객체 형태가 아닙니다.');
  }

  // 1. seoTitle
  let seoTitle = typeof raw.seoTitle === 'string' ? stripHtml(raw.seoTitle).slice(0, 100) : '';
  if (!seoTitle || seoTitle.length < 2) {
    seoTitle = `익명 게시글 #${postId}`;
  }

  // 2. slug
  const rawSlug = typeof raw.slug === 'string' ? raw.slug : '';
  const slug = normalizeSlug(rawSlug, postId);

  // 3. metaTitle
  let metaTitle = typeof raw.metaTitle === 'string' ? stripHtml(raw.metaTitle).slice(0, 100) : '';
  if (!metaTitle) {
    metaTitle = `${seoTitle} | Bright Notes`;
  }

  // 4. metaDescription
  let metaDescription = typeof raw.metaDescription === 'string' ? stripHtml(raw.metaDescription).slice(0, 250) : '';
  if (!metaDescription) {
    metaDescription = seoTitle;
  }

  // 5. metaKeywords
  let metaKeywords: string[] = [];
  if (Array.isArray(raw.metaKeywords)) {
    metaKeywords = Array.from(
      new Set<string>(
        raw.metaKeywords
          .filter((k): k is string => typeof k === 'string')
          .map((k: string) => stripHtml(k).replace(/#/g, '').trim())
          .filter((k: string) => k.length > 0)
      )
    ).slice(0, 10);
  }

  // 6. summary
  let summary = typeof raw.summary === 'string' ? stripHtml(raw.summary).slice(0, 300) : '';
  if (!summary) {
    summary = metaDescription;
  }

  // 7. category
  const allowedCategories = ['직장생활', '리더십', '커뮤니케이션', '커리어', '조직문화', '인간관계', '개발', 'AI', '일상', '기타'];
  let category = typeof raw.category === 'string' ? stripHtml(raw.category).trim() : '일상';
  if (!allowedCategories.includes(category)) {
    category = '일상';
  }

  // 8. tags
  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = Array.from(
      new Set<string>(
        raw.tags
          .filter((t): t is string => typeof t === 'string')
          .map((t: string) => stripHtml(t).replace(/#/g, '').trim())
          .filter((t: string) => t.length > 0)
      )
    ).slice(0, 5);
  }

  // 9. indexable
  const indexable = typeof raw.indexable === 'boolean' ? raw.indexable : true;

  return {
    seoTitle,
    slug,
    metaTitle,
    metaDescription,
    metaKeywords,
    summary,
    category,
    tags,
    indexable,
  };
}

/**
 * OpenAI API를 호출하여 게시글 SEO 메타데이터 생성
 */
export async function generateBambooSeoWithOpenAI(
  postId: number,
  content: string
): Promise<BambooSeoResult> {
  const plainContent = stripHtml(content);

  // 본문 길이가 15자 미만이면 AI 호출을 생략하고 fallback 반환
  if (plainContent.length < 15) {
    return generateFallbackSeo(postId, content, 'skipped');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    console.warn('[Bamboo SEO] OPENAI_API_KEY가 설정되어 있지 않습니다. Fallback을 적용합니다.');
    return generateFallbackSeo(postId, content, 'failed');
  }

  const systemInstruction = `
사용자가 작성한 한국어 익명 게시글을 분석하여 검색엔진 최적화(SEO)를 위한 메타데이터를 JSON 형태로 생성합니다.

규칙:
1. 원문의 의미를 왜곡하거나 새로운 사실/인물을 만들어내지 마세요.
2. 게시글을 평가하거나 사용자를 비난하지 마세요.
3. 개인정보, 실명, 회사명, 연락처 등 민감한 정보가 있다면 메타데이터에 반복 노출하지 마세요.
4. 공격적 표현이나 욕설은 메타데이터에서 중립적이고 정제된 표현으로 변경하세요.
5. 원문에 없는 사람, 회사, 사건을 추가하지 마세요.
6. 응답은 아래 지정된 JSON 객체 형식만 정확히 출력하세요.

JSON 출력 형식 예시:
{
  "seoTitle": "커뮤니케이션이 잘되지 않을 때 점검해야 할 세 가지",
  "slug": "communication-checklist",
  "metaTitle": "커뮤니케이션이 잘되지 않을 때 점검할 3가지 | Bright Notes",
  "metaDescription": "커뮤니케이션이 어긋날 때 말하는 사람이 먼저 확인해야 할 명확성, 논리성, 배려의 원칙을 살펴봅니다.",
  "metaKeywords": ["커뮤니케이션", "의사소통", "조직문화", "직장생활"],
  "summary": "효과적인 커뮤니케이션을 위해 명확성, 논리성, 친절함을 점검해야 한다는 글입니다.",
  "category": "직장생활",
  "tags": ["커뮤니케이션", "조직문화"],
  "indexable": true
}

각 필드 규칙:
- seoTitle: 게시글 핵심 주제를 명확하게 설명 (15~45자 내외). 제목이 없는 원문을 자연스러운 제목으로 요약.
- slug: 영어 소문자 및 하이픈만 사용 (3~6개 단어, 20~70자). 날짜, UUID, 숫자 제외.
- metaTitle: 핵심 키워드 포함 및 사이트명('| Bright Notes') 포함.
- metaDescription: 게시글 내용 요약 (80~160자 내외).
- metaKeywords: 관련 키워드 배열 (3~10개).
- summary: 간결한 1~2문장 요약.
- category: ["직장생활", "리더십", "커뮤니케이션", "커리어", "조직문화", "인간관계", "개발", "AI", "일상", "기타"] 중 가장 적절한 하나 선택.
- tags: 태그 배열 (2~5개).
- indexable: 검색할 가치가 있는 내용이면 true, 테스트글/광고/스팸/비방/매우짧음이면 false.
`.trim();

  const userPrompt = `[분석할 게시글 본문 (ID: ${postId})]\n${plainContent.slice(0, 1500)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Bamboo SEO] OpenAI API 호출 실패 (${response.status}):`, errorText.slice(0, 200));
      const fallback = generateFallbackSeo(postId, content, 'failed');
      fallback.aiError = `HTTP ${response.status}: OpenAI API error`;
      return fallback;
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new Error('OpenAI 응답 본문이 비어있습니다.');
    }

    const parsedJson = JSON.parse(rawContent);
    const seoData = validateAndNormalizeAiResponse(parsedJson, postId);

    return {
      seoData,
      seoStatus: 'completed',
      aiModel: modelName,
    };
  } catch (error: unknown) {
    const err = error as Error;
    const errorMessage = err?.name === 'AbortError' ? 'OpenAI API 호출 시간 초과 (15초)' : (err?.message || String(error));
    console.error('[Bamboo SEO] OpenAI 처리 중 오류 발생:', errorMessage);
    const fallback = generateFallbackSeo(postId, content, 'failed');
    fallback.aiError = errorMessage;
    return fallback;
  }
}
