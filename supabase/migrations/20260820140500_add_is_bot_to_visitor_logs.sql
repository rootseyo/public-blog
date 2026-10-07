-- Add is_bot column to visitor_logs
ALTER TABLE public.visitor_logs ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;

-- Create index on is_bot for faster statistics queries
CREATE INDEX IF NOT EXISTS idx_visitor_logs_is_bot ON public.visitor_logs(is_bot);

-- Backfill existing bot records
UPDATE public.visitor_logs
SET is_bot = TRUE
WHERE device_type = 'Crawler/Bot'
   OR os = 'Crawler/Bot'
   OR browser = 'Crawler/Bot'
   OR user_agent ~* '(bot\y|crawler|spider|slurp|facebookexternalhit|google-inspectiontool|bytespider|externalagent|bingpreview|yandex|yeti|daumoa|applebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|gptbot|chatgpt|claudebot|anthropic|perplexity|amazonbot|cohere|ccbot|feedfetcher|mediapartners-google|lighthouse|headlesschrome|headless)';
