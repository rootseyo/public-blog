// Run only against a disposable PostgreSQL database named indexnow_test:
// INDEXNOW_TEST_DATABASE_URL=postgresql://.../indexnow_test node --test scripts/test-indexnow.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { Pool } = require('pg');

function loadModule(file, dependencies, fetchImpl) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console: { log() {}, error() {} }, URL, Date, Intl, crypto, AbortSignal,
    fetch: fetchImpl,
  }, { filename: file });
  return exports;
}

const connectionString = process.env.INDEXNOW_TEST_DATABASE_URL;
test('IndexNow durable queue and host backoff', { skip: !connectionString }, async (t) => {
  const dbUrl = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(dbUrl.hostname));
  assert.equal(dbUrl.pathname, '/indexnow_test', 'Use a disposable test database');
  const pool = new Pool({ connectionString });
  const query = (sql, params) => pool.query(sql, params);
  let fetchImpl;
  let requests;
  const app = loadModule('src/lib/indexnow.ts', { './db': { query } }, async (...args) => {
    requests.push(args);
    return fetchImpl(...args);
  });
  const host = 'example.com';
  const url = (slug) => `https://${host}/posts/${slug}`;
  const reset = async () => {
    await query('TRUNCATE indexnow_url_queue, indexnow_host_state');
    await query('INSERT INTO indexnow_host_state(host) VALUES ($1)', [host]);
    requests = [];
    fetchImpl = async () => new Response('', { status: 200 });
  };
  const openGate = () => query("UPDATE indexnow_host_state SET next_submission_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");
  const due = () => query("UPDATE indexnow_url_queue SET next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");
  try {
    await query(fs.readFileSync('supabase/migrations/20260901014500_add_indexnow_url_queue.sql', 'utf8'));
    const migration = fs.readFileSync('supabase/migrations/20260909123000_add_indexnow_host_backoff.sql', 'utf8');
    await query(migration);
    await t.test('migration retains an existing 429 deadline and is repeatable', async () => {
      await reset();
      await query('DELETE FROM indexnow_host_state');
      await query("INSERT INTO indexnow_url_queue(url, next_attempt_at, last_error) VALUES ($1, CURRENT_TIMESTAMP + INTERVAL '4 days', 'IndexNow returned HTTP 429')", [url('old')]);
      await query(migration);
      await query(migration);
      const { rows } = await query('SELECT * FROM indexnow_host_state');
      assert.equal(rows.length, 1);
      assert.ok(rows[0].next_submission_at.getTime() > Date.now() + 3 * 86400000);
    });
    await t.test('429 blocks fresh URLs and manual retries for the entire site', async () => {
      await reset();
      await app.enqueueIndexNowUrls([url('a')]);
      fetchImpl = async () => new Response('', { status: 429 });
      const result = await app.processPendingIndexNowSubmissions();
      assert.equal(result.deferred, true);
      assert.equal(result.success, false);
      assert.equal(result.error, 'IndexNow returned HTTP 429');
      assert.ok(Date.parse(result.retryAt) >= Date.now() + 86400000 - 1000);
      await app.enqueueIndexNowUrls([url('a'), url('new')]);
      assert.equal((await app.processPendingIndexNowSubmissions()).deferred, true);
      assert.equal(requests.length, 1);
      const { rows } = await query('SELECT attempt_count FROM indexnow_url_queue ORDER BY id');
      assert.deepEqual(rows.map((r) => r.attempt_count), [1, 0]);
    });
    await t.test('Retry-After seconds and HTTP date override the fallback', async () => {
      for (const value of ['432000', new Date(Date.now() + 5 * 86400000).toUTCString()]) {
        await reset();
        await app.enqueueIndexNowUrls([url('retry-after')]);
        fetchImpl = async () => new Response('', { status: 429, headers: { 'Retry-After': value } });
        const result = await app.processPendingIndexNowSubmissions();
        assert.ok(Date.parse(result.retryAt) >= Date.now() + 5 * 86400000 - 2000);
      }
    });
    await t.test('repeated throttles extend backoff; 202 resets the throttle streak', async () => {
      await reset();
      await app.enqueueIndexNowUrls([url('repeat')]);
      fetchImpl = async () => new Response('', { status: 429 });
      for (const days of [1, 2, 3, 3]) {
        await openGate(); await due();
        const result = await app.processPendingIndexNowSubmissions();
        assert.ok(Math.abs(Date.parse(result.retryAt) - Date.now() - days * 86400000) < 2000);
      }
      await openGate(); await due();
      fetchImpl = async () => new Response('', { status: 202 });
      assert.equal((await app.processPendingIndexNowSubmissions()).success, true);
      assert.equal((await query('SELECT consecutive_rate_limits FROM indexnow_host_state')).rows[0].consecutive_rate_limits, 0);
    });
    await t.test('concurrent callers cannot send separate batches', async () => {
      await reset();
      await app.enqueueIndexNowUrls(Array.from({ length: 101 }, (_, i) => url(`batch-${i}`)));
      let release, started;
      const inFlight = new Promise((r) => { started = r; });
      fetchImpl = () => { started(); return new Promise((r) => { release = r; }); };
      const first = app.processPendingIndexNowSubmissions();
      await inFlight;
      const second = await app.processPendingIndexNowSubmissions();
      assert.equal(second.deferred, true);
      assert.equal(requests.length, 1);
      release(new Response('', { status: 200 }));
      await first;
      assert.equal((await query("SELECT count(*)::int AS n FROM indexnow_url_queue WHERE status='pending'")).rows[0].n, 1);
    });
    await t.test('an edit during submission stays pending and respects site cooldown', async () => {
      await reset();
      await app.enqueueIndexNowUrls([url('edit')]);
      fetchImpl = async () => {
        await app.enqueueIndexNowUrls([url('edit')]);
        return new Response('', { status: 429 });
      };
      await app.processPendingIndexNowSubmissions();
      const row = (await query('SELECT * FROM indexnow_url_queue')).rows[0];
      assert.equal(row.status, 'pending');
      assert.equal(row.attempt_count, 1);
      assert.equal((await app.processPendingIndexNowSubmissions()).deferred, true);
      assert.equal(requests.length, 1);
    });
    await t.test('expired processing leases recover; terminal errors do not retry', async () => {
      await reset();
      await app.enqueueIndexNowUrls([url('crashed')]);
      await query("UPDATE indexnow_url_queue SET status='processing', attempt_count=1, locked_at=CURRENT_TIMESTAMP - INTERVAL '10 minutes', lock_token='old'");
      fetchImpl = async () => new Response('', { status: 403 });
      const result = await app.processPendingIndexNowSubmissions({ retriesOnly: true });
      assert.equal(result.success, false);
      assert.equal(result.deferred, undefined);
      assert.equal((await query('SELECT status FROM indexnow_url_queue')).rows[0].status, 'failed');
      assert.equal((await query('SELECT lock_token FROM indexnow_host_state')).rows[0].lock_token, null);
    });
    await t.test('network failures remain pending with backoff', async () => {
      await reset();
      await app.enqueueIndexNowUrls([url('network')]);
      fetchImpl = async () => { throw new Error('network unavailable'); };
      const result = await app.processPendingIndexNowSubmissions();
      assert.equal(result.deferred, true);
      assert.ok(Date.parse(result.retryAt) >= Date.now() + 15 * 60000 - 1000);
    });
  } finally { await pool.end(); }
});

test('sitemap surfaces DB outages instead of silently dropping articles', async () => {
  const sitemap = loadModule('src/app/sitemap.ts', { '@/lib/db': {
    query: async (_sql, _params, options) => {
      assert.equal(options.throwOnConnectionError, true);
      throw new Error('database unavailable');
    },
  } });
  await assert.rejects(sitemap.default(), /database unavailable/);
});

test('sitemap encodes URLs and does not invent modification times', async () => {
  const sitemap = loadModule('src/app/sitemap.ts', { '@/lib/db': {
    query: async (sql) => ({ rows: sql.includes('FROM posts')
      ? [{ slug: '한글', updated_at: '2026-09-08T00:00:00Z' }]
      : [] }),
  } });
  const result = await sitemap.default();
  assert.equal(result.length, 4);
  assert.equal(result[0].lastModified, undefined);
  assert.equal(result[3].url, 'https://example.com/posts/%ED%95%9C%EA%B8%80');
  assert.equal(result[3].lastModified.toISOString(), '2026-09-08T00:00:00.000Z');
});
