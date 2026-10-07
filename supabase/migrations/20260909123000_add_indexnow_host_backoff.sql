-- IndexNow limits apply to the site, not individual URLs. Share the cooldown
-- and a short processing lease across cron and manual requests / Worker isolates.
-- The host state is populated at runtime for each configured site URL.
CREATE TABLE IF NOT EXISTS public.indexnow_host_state (
  host text PRIMARY KEY,
  next_submission_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consecutive_rate_limits integer NOT NULL DEFAULT 0 CHECK (consecutive_rate_limits >= 0),
  lock_token text,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.indexnow_host_state ENABLE ROW LEVEL SECURITY;
