/** Public origin for canonical URLs and absolute asset links. */
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

export function absoluteSiteUrl(path: string) {
  return new URL(path, `${SITE_URL}/`).toString();
}
