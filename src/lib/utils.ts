import { SITE_URL } from './site-url';

export function getPublicImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  // If it's already an absolute URL, return as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // In development, prepend the production domain for /uploads/ paths
  if (process.env.NODE_ENV === 'development' && url.startsWith('/uploads/')) {
    return `${SITE_URL}${url}`;
  }

  return url;
}

export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  // Remove HTML tags and extra whitespace
  const cleanContent = content.replace(/<[^>]*>?/gm, '').trim();
  // Average Korean character length estimate for "words" in reading speed terms
  const charCount = cleanContent.length;
  const minutes = Math.ceil(charCount / wordsPerMinute);
  return minutes > 0 ? minutes : 1;
}

export function extractFirstImageUrl(content: string): string | null {
  const match = content.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
}

/**
 * Crawler UAs often include a desktop or mobile browser token as well. Detect
 * them before OS, browser, or device parsing so they do not pollute visitor
 * environment statistics.
 */
export function isCrawlerOrBot(userAgent: string): boolean {
  if (!userAgent || userAgent === 'unknown') return false;
  return /(bot\b|crawler|spider|slurp|facebookexternalhit|google-inspectiontool|bytespider|externalagent|bingpreview|yandex|yeti|daumoa|applebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|gptbot|chatgpt|claudebot|anthropic|perplexity|amazonbot|cohere|ccbot|feedfetcher|mediapartners-google|lighthouse|headlesschrome|headless)/i.test(userAgent);
}

export function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();

  if (isCrawlerOrBot(userAgent)) return 'Crawler/Bot';
  
  // Tablet detection
  if (
    /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua) ||
    (typeof window !== 'undefined' && ua.includes('macintosh') && 'ontouchend' in {} ) // iPad Pro with Desktop-mode UA
  ) {
    return 'tablet';
  }
  
  // Mobile detection - added 'mobi' and made regex case-insensitive for safety
  if (
    /mobile|android|iphone|ipad|ipod|iemobile|blackberry|kindle|silk-accelerated|(hpw|web)os|opera m(obi|ini)|ucbrowser|ucweb|mobi/i.test(ua)
  ) {
    return 'mobile';
  }
  
  return 'desktop';
}

export function getOS(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (isCrawlerOrBot(userAgent)) return 'Crawler/Bot';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('linux')) return 'Linux';
  return 'Other';
}

export function getBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (isCrawlerOrBot(userAgent)) return 'Crawler/Bot';
  if (ua.includes('kakao')) return 'KakaoTalk';
  if (ua.includes('naver')) return 'Naver';
  if (ua.includes('instagram')) return 'Instagram';
  if (ua.includes('linkedinapp')) return 'LinkedIn';
  if (ua.includes('samsungbrowser/')) return 'Samsung Internet';
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';
  if (ua.includes('firefox/') || ua.includes('fxios/')) return 'Firefox';
  if (ua.includes('crios/') || ua.includes('chrome/') || ua.includes('chromium/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome')) return 'Safari';
  return 'Other';
}

export function getDeviceModel(userAgent: string): string {
  const ua = userAgent; // Use original case for parsing models

  if (isCrawlerOrBot(userAgent)) return 'Crawler/Bot';
  
  // iOS detection
  if (ua.includes('iPhone')) {
    const match = ua.match(/iPhone OS (\d+)_(\d+)/);
    if (match) {
      // Detailed iPhone model is not in UA, but we can guess or just show iPhone
      // For more detail, we'd need client-side JS (WebGL or Screen size)
      return 'iPhone';
    }
    return 'iPhone';
  }
  if (ua.includes('iPad')) return 'iPad';

  // Android detection (Models are usually in parentheses)
  // e.g., Mozilla/5.0 (Linux; Android 10; SM-G981B) ...
  const androidMatch = ua.match(/\(([^)]+)\)/);
  if (androidMatch) {
    const parts = androidMatch[1].split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      // Common Samsung prefixes
      if (trimmed.startsWith('SM-') || trimmed.startsWith('SAMSUNG SM-')) {
        const model = trimmed.replace('SAMSUNG ', '');
        // Mapping common Samsung models
        if (model.includes('S921')) return 'Galaxy S24';
        if (model.includes('S926')) return 'Galaxy S24+';
        if (model.includes('S928')) return 'Galaxy S24 Ultra';
        if (model.includes('S911')) return 'Galaxy S23';
        if (model.includes('S918')) return 'Galaxy S23 Ultra';
        if (model.includes('G991')) return 'Galaxy S21';
        if (model.includes('G998')) return 'Galaxy S21 Ultra';
        if (model.includes('G980')) return 'Galaxy S20';
        if (model.includes('N986')) return 'Galaxy Note 20 Ultra';
        if (model.includes('F946')) return 'Galaxy Z Fold 5';
        if (model.includes('F731')) return 'Galaxy Z Flip 5';
        // Generic return if not mapped
        return model;
      }
    }
  }

  // Windows
  if (ua.includes('Windows NT 10.0')) return 'Windows 10/11 PC';
  if (ua.includes('Macintosh')) return 'Mac PC';

  return 'Unknown';
}

export function formatDate(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

export function formatRelativeTime(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) return '방금 전';
  if (diffInSeconds < 60) return '방금 전';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`;
  
  // Default to YYYY-MM-DD if more than 7 days
  return date.toISOString().split('T')[0];
}

export function safeDateISO(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return new Date().toISOString();
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
