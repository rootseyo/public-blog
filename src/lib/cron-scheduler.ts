import { query } from './db';
import { processPendingIndexNowSubmissions, type IndexNowResult } from './indexnow';

let scheduledTimeout: NodeJS.Timeout | null = null;
const isCloudflareRuntime = process.env.RUNTIME_PLATFORM === 'cloudflare';

export async function runIndexingTask(triggerType: 'cron' | 'manual' = 'cron') {
  console.log(`[Scheduled Indexing] Processing changed URL queue (Trigger: ${triggerType})...`);
  let urlCount = 0;
  let status = 'success';
  let message = '';
  let taskResult: IndexNowResult;
  
  try {
    const result = await processPendingIndexNowSubmissions();
    taskResult = result;
    urlCount = result.urlCount;
    if (result.deferred) {
      status = 'deferred';
      message = result.message || 'Bing 전송 재시도 대기 중입니다.';
    }
    else if (!result.queued) message = '전송 대기 중인 변경 URL이 없습니다.';
    else if (result.success) message = `Bing IndexNow: ${urlCount}개 변경 URL 전송 완료`;
    else {
      status = 'failed';
      message = `Bing IndexNow: ${result.error}${result.retryAt ? ` / 재시도: ${result.retryAt}` : ''}`;
    }
  } catch (error: any) {
    status = 'failed';
    message = error.message || '알 수 없는 오류가 발생했습니다.';
    taskResult = { success: false, urlCount, queued: false, error: message };
    console.error('[Scheduled Indexing] Error during execution:', error);
  } finally {
    try {
      await query(
        'INSERT INTO indexing_logs (trigger_type, status, message, url_count) VALUES ($1, $2, $3, $4)',
        [triggerType, status, message, urlCount]
      );
    } catch (dbErr) {
      console.error('[Scheduled Indexing] Failed to write log to DB:', dbErr);
    }
    
    if (triggerType === 'cron' && !isCloudflareRuntime) {
      scheduleNextRun();
    }
  }
  return { ...taskResult, message };
}

export async function scheduleNextRun() {
  if (isCloudflareRuntime) return;
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }

  try {
    const res = await query('SELECT * FROM indexing_schedules WHERE id = 1');
    const schedule = res.rows[0];

    if (!schedule || !schedule.enabled) {
      console.log('[Scheduled Indexing] Scheduler is disabled in database.');
      return;
    }

    const now = new Date();
    const target = new Date();
    target.setHours(schedule.scheduled_hour, 0, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    const delay = target.getTime() - now.getTime();
    console.log(`[Scheduled Indexing] Next run scheduled at ${target.toLocaleString()} (in ${Math.round(delay / 1000 / 60)} minutes)`);

    scheduledTimeout = setTimeout(() => runIndexingTask('cron'), delay);
  } catch (error) {
    console.error('[Scheduled Indexing] Failed to schedule next run:', error);
    // Retry scheduling in 1 minute on database/query error
    scheduledTimeout = setTimeout(scheduleNextRun, 60000);
  }
}

export function startScheduledIndexing() {
  if (isCloudflareRuntime) return;
  console.log('[Scheduled Indexing] Initializing scheduler...');
  scheduleNextRun();
}

/**
 * Cloudflare invokes this every hour in UTC. The persisted schedule remains in
 * Asia/Seoul so admins can change the run hour without redeploying the Worker.
 */
export async function runScheduledIndexingIfDue() {
  const result = await query('SELECT scheduled_hour, enabled FROM indexing_schedules WHERE id = 1');
  const schedule = result.rows[0] as { scheduled_hour: number; enabled: boolean } | undefined;
  if (!schedule?.enabled) return { executed: false, reason: 'disabled' };

  const koreaHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  if (koreaHour === schedule.scheduled_hour) {
    await runIndexingTask('cron');
    return { executed: true, reason: 'scheduled' };
  }

  // The Worker wakes hourly. Outside the configured daily run, it only sends
  // retries that have reached their backoff deadline; newly queued URLs wait
  // for the next scheduled batch.
  const retryResult = await processPendingIndexNowSubmissions({ retriesOnly: true });
  if (!retryResult.queued) return { executed: false, reason: 'outside_schedule' };

  const status = retryResult.deferred ? 'deferred' : retryResult.success ? 'success' : 'failed';
  const message = retryResult.message || (retryResult.success
    ? `Bing IndexNow retry: ${retryResult.urlCount}개 URL 전송 완료`
    : `Bing IndexNow retry: ${retryResult.error}${retryResult.retryAt ? ` / 재시도: ${retryResult.retryAt}` : ''}`);
  await query(
    'INSERT INTO indexing_logs (trigger_type, status, message, url_count) VALUES ($1, $2, $3, $4)',
    ['cron', status, message, retryResult.urlCount]
  );
  return { executed: true, reason: 'retry' };
}
