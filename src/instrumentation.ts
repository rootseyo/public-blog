export async function register() {
  // Only run in the Node.js server runtime, not edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.RUNTIME_PLATFORM !== 'cloudflare') {
    // Prevent starting the scheduler during development or compilation checks
    if (process.env.NODE_ENV === 'production') {
      const { startScheduledIndexing } = await import('./lib/cron-scheduler');
      startScheduledIndexing();
    }
  }
}
