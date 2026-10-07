import { rm } from 'node:fs/promises';

// User uploads live in Supabase Storage. Keeping them in the Worker asset bundle
// would both duplicate the data and exceed Cloudflare's per-asset size limit.
await Promise.all([
  rm('.open-next/assets/uploads', { recursive: true, force: true }),
  rm('.open-next/server-functions/default/public/uploads', { recursive: true, force: true }),
]);
