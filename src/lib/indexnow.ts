import { query } from './db';
import { SITE_URL } from './site-url';

const INDEXNOW_HOST = new URL(SITE_URL).host;
const INDEXNOW_BATCH_SIZE = 100;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_DELAY_MS = 24 * 60 * 60 * 1000;

export type IndexNowResult = {
  success: boolean;
  urlCount: number;
  queued: boolean;
  status?: number;
  error?: string;
  retryAt?: string;
  deferred?: boolean;
  message?: string;
};

type IndexNowSubmission = {
  success: boolean;
  status?: number;
  error?: string;
  retryAfterMs?: number;
};

type QueuedUrl = {
  id: number;
  url: string;
  attempt_count: number;
};

function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) && seconds <= Number.MAX_SAFE_INTEGER / 1000
      ? seconds * 1000
      : undefined;
  }

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) return undefined;
  return Math.max(0, retryAt - now);
}

function formatSubmissionError(status: number, responseBody: string) {
  const body = responseBody.trim();
  if (!body) return `IndexNow returned HTTP ${status}`;

  try {
    const parsed = JSON.parse(body) as { errorCode?: string; message?: string };
    const detail = parsed.errorCode || parsed.message;
    if (detail) return `IndexNow returned HTTP ${status}: ${detail}`;
  } catch {
    // Keep non-JSON error responses as-is.
  }

  return `IndexNow returned HTTP ${status}: ${body}`;
}

async function submitToIndexNow(urls: string[]) {
  const host = INDEXNOW_HOST;
  const key = process.env.INDEXNOW_KEY;
  if (!key) return { success: false, urlCount: urls.length, queued: false, error: 'IndexNow is not configured' };
  const keyLocation = `https://${host}/${key}.txt`;

  const payload = {
    host,
    key,
    keyLocation,
    urlList: urls,
  };

  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[IndexNow] Submission failed:', response.status, errorText);
      return {
        success: false,
        status: response.status,
        error: formatSubmissionError(response.status, errorText),
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      } satisfies IndexNowSubmission;
    }

    console.log('[IndexNow] Submission successful:', urls);
    return { success: true, status: response.status } satisfies IndexNowSubmission;
  } catch (error) {
    console.error('[IndexNow] Error during submission:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) } satisfies IndexNowSubmission;
  }
}

/** Queue only URLs from this site. A new content change reactivates a sent URL. */
export async function enqueueIndexNowUrls(urls: string[]) {
  if (!process.env.INDEXNOW_KEY) return { queued: 0, disabled: true };

  const validUrls = [...new Set(urls)].map((value) => {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.host !== INDEXNOW_HOST) {
      throw new Error(`IndexNow URL must belong to ${INDEXNOW_HOST}: ${value}`);
    }
    return parsed.toString();
  });

  if (validUrls.length === 0) return { queued: 0 };

  await query(
    `INSERT INTO indexnow_url_queue AS queue (url)
     SELECT unnest($1::text[])
     ON CONFLICT (url) DO UPDATE SET
       status = 'pending',
       attempt_count = CASE
         WHEN queue.status IN ('pending', 'processing') AND queue.attempt_count > 0 THEN queue.attempt_count
         ELSE 0
       END,
       next_attempt_at = CASE
         WHEN queue.status IN ('pending', 'processing') AND queue.attempt_count > 0 THEN queue.next_attempt_at
         ELSE CURRENT_TIMESTAMP
       END,
       lock_token = NULL,
       locked_at = NULL,
       last_error = CASE
         WHEN queue.status IN ('pending', 'processing') AND queue.attempt_count > 0 THEN queue.last_error
         ELSE NULL
       END,
       sent_at = NULL,
       updated_at = CURRENT_TIMESTAMP`,
    [validUrls]
  );
  console.log(`[IndexNow] Queued ${validUrls.length} changed URL(s).`);
  return { queued: validUrls.length };
}

function getRetryDelayMs(attemptCount: number, retryAfterMs?: number) {
  // 15m, 30m, 60m... capped at one day. The hourly Worker cron picks up due retries.
  const fallbackDelay = Math.min(
    15 * 60 * 1000 * (2 ** Math.max(0, attemptCount - 1)),
    MAX_RETRY_DELAY_MS
  );

  // Never retry earlier than the server requested. Server-directed delays are
  // intentionally not capped by our fallback limit.
  return retryAfterMs === undefined ? fallbackDelay : Math.max(fallbackDelay, retryAfterMs);
}

/**
 * Claims a small batch atomically, then sends it. A lock token protects a URL
 * that was edited again while a previous batch was in flight.
 */
export async function processPendingIndexNowSubmissions(options: { retriesOnly?: boolean } = {}): Promise<IndexNowResult> {
  const token = crypto.randomUUID();
  // A database lease works across Worker isolates; URL row locks alone allow
  // two callers to send different batches concurrently during a site-wide limit.
  const lease = await query(
    `UPDATE indexnow_host_state
     SET lock_token = $2, locked_until = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
         next_submission_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
         updated_at = CURRENT_TIMESTAMP
     WHERE host = $1 AND next_submission_at <= CURRENT_TIMESTAMP
       AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)
     RETURNING consecutive_rate_limits`,
    [INDEXNOW_HOST, token]
  );
  if (lease.rows.length === 0) {
    const state = await query(
      `SELECT GREATEST(next_submission_at, locked_until) AS retry_at
       FROM indexnow_host_state WHERE host = $1`, [INDEXNOW_HOST]
    );
    if (!state.rows[0]) throw new Error('IndexNow host state is missing. Apply the IndexNow host backoff migration.');
    const retryAt = new Date(state.rows[0].retry_at).toISOString();
    return { success: true, urlCount: 0, queued: false, deferred: true, retryAt,
      message: `Bing 전송 대기 중입니다. 다음 전송 가능 시각: ${formatIndexNowRetryAt(retryAt)}` };
  }

  try {
    // Recover URLs left processing when an earlier Worker invocation stopped.
    await query(
      `UPDATE indexnow_url_queue
       SET status = 'pending', lock_token = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE status = 'processing' AND locked_at <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'`
    );
    return await sendPendingBatch(token, Number(lease.rows[0].consecutive_rate_limits), options);
  } finally {
    await query(
      `UPDATE indexnow_host_state SET lock_token = NULL, locked_until = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE host = $1 AND lock_token = $2`,
      [INDEXNOW_HOST, token]
    );
  }
}

export function formatIndexNowRetryAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value)) + ' (한국 시간)';
}

async function sendPendingBatch(token: string, rateLimits: number, options: { retriesOnly?: boolean }): Promise<IndexNowResult> {
  const retriesCondition = options.retriesOnly ? 'AND attempt_count > 0' : '';
  const claimed = await query(
    `WITH candidates AS (
       SELECT id
       FROM indexnow_url_queue
       WHERE status = 'pending'
         AND next_attempt_at <= CURRENT_TIMESTAMP
         ${retriesCondition}
       ORDER BY next_attempt_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE indexnow_url_queue AS queue
     SET status = 'processing',
         attempt_count = queue.attempt_count + 1,
         lock_token = $2,
         locked_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     FROM candidates
     WHERE queue.id = candidates.id
     RETURNING queue.id, queue.url, queue.attempt_count`,
    [INDEXNOW_BATCH_SIZE, token]
  );
  const urls = claimed.rows as QueuedUrl[];
  if (urls.length === 0) return { success: true, urlCount: 0, queued: false };

  const submission = await submitToIndexNow(urls.map((row) => row.url));
  const ids = urls.map((row) => row.id);
  if (submission.success) {
    await query(
      `UPDATE indexnow_host_state SET consecutive_rate_limits = 0
       WHERE host = $1 AND lock_token = $2`, [INDEXNOW_HOST, token]
    );
    await query(
      `UPDATE indexnow_url_queue
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, lock_token = NULL,
           locked_at = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::bigint[]) AND lock_token = $2`,
      [ids, token]
    );
    return { success: true, urlCount: urls.length, queued: true, status: submission.status };
  }

  const error = submission.error || `IndexNow returned HTTP ${submission.status || 'unknown'}`;
  const retryable = !submission.status || submission.status === 429 || submission.status >= 500;
  if (retryable) {
    const retryDelay = getRetryDelayMs(
      Math.max(...urls.map((row) => row.attempt_count)),
      submission.retryAfterMs
    );
    // With no Retry-After, give a throttled site a full day of quiet, then
    // 48h / 72h for consecutive 429s. This is our conservative policy, not an
    // IndexNow quota. A longer server-directed delay always takes precedence.
    const delay = submission.status === 429
      ? Math.max(retryDelay, RATE_LIMIT_DELAY_MS * Math.min(3, 2 ** Math.min(rateLimits, 2)))
      : retryDelay;
    const retryAt = new Date(Date.now() + delay);
    await query(
      `UPDATE indexnow_host_state
       SET next_submission_at = GREATEST(next_submission_at, $3::timestamptz),
           consecutive_rate_limits = consecutive_rate_limits + $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE host = $1 AND lock_token = $2`,
      [INDEXNOW_HOST, token, retryAt.toISOString(), submission.status === 429 ? 1 : 0]
    );
    await query(
      `UPDATE indexnow_url_queue
       SET status = 'pending', next_attempt_at = $1, lock_token = NULL,
           locked_at = NULL, last_error = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($3::bigint[]) AND lock_token = $4`,
      [retryAt.toISOString(), error, ids, token]
    );
    return { success: false, urlCount: urls.length, queued: true, deferred: true,
      status: submission.status, error, retryAt: retryAt.toISOString(),
      message: `Bing ${submission.status === 429 ? '요청 제한(HTTP 429)' : '일시적 전송 오류'}으로 재시도를 예약했습니다. 다음 전송 가능 시각: ${formatIndexNowRetryAt(retryAt.toISOString())}` };
  }

  await query(
    `UPDATE indexnow_url_queue
     SET status = 'failed', lock_token = NULL, locked_at = NULL,
         last_error = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($2::bigint[]) AND lock_token = $3`,
    [error, ids, token]
  );
  return { success: false, urlCount: urls.length, queued: true, error };
}
