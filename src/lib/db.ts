const { Client, Pool } = require('pg');

// For debugging in development (be careful not to log secrets in production)
if (!process.env.DATABASE_URL) {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env.production' });
    if (!process.env.DATABASE_URL) {
      dotenv.config({ path: '.env' });
    }
  } catch (e) {}
}

console.log('Database URL configured:', Boolean(process.env.DATABASE_URL));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing in environment variables. Check your .env.local file.');
}

const isCloudflareRuntime = process.env.RUNTIME_PLATFORM === 'cloudflare';
const connectionConfig = {
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
};

// Cloudflare TCP sockets are request-scoped. Reusing a module-level Pool there
// can retain a socket from a previous request and leave a later RSC request
// without a response. Keep the local/PI pool, but create and close a Client for
// every Worker query.
const pool = isCloudflareRuntime
  ? null
  : new Pool({
      ...connectionConfig,
      idleTimeoutMillis: 60000,
      max: 10,
    });

pool?.on('error', (err: any) => {
  console.error('Unexpected error on idle client', err);
});

let isDbAvailable = true;

export const query = async (text: string, params?: any[], options: { throwOnConnectionError?: boolean } = {}) => {
  const start = Date.now();
  let client: any = null;
  try {
    if (isCloudflareRuntime) {
      client = new Client(connectionConfig);
      await client.connect();
    }

    const res = await (client ? client.query(text, params) : pool!.query(text, params));
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log('Slow query:', { text, duration, rows: res.rowCount });
    }
    isDbAvailable = true; // Reset on success
    return res;
  } catch (error: any) {
    // Check for common connection/authentication errors
    const isAuthError = error.code === '28P01' || error.code === '28000';
    const isConnError = error.code === 'ECONNREFUSED' || error.code === '57P03' || error.code === '3D000';
    
    if (isAuthError || isConnError) {
      if (isDbAvailable) {
        if (isAuthError) {
          console.warn(`❌ Database Authentication Failed (Code: ${error.code}).\nPlease check your .env.local and ensure the DB user/password matches your local PostgreSQL setup.\nBackground tasks (analytics) will be skipped for this session.`);
        } else {
          console.warn(`⚠️  Database Connection Failed (Code: ${error.code}). Subsequent background tasks will be skipped.`);
        }
        isDbAvailable = false;
      }

      const isSelectQuery = text.trim().toUpperCase().startsWith('SELECT');
      if (isSelectQuery && !options.throwOnConnectionError) {
        return { rows: [], rowCount: 0 };
      }
    }

    if (!isDbAvailable && (text.includes('visitor_logs') || text.includes('post_views'))) {
      // Silently fail for background analytics if DB is known to be down
      return { rows: [], rowCount: 0, skipped: true };
    }

    console.error('DB Query Error:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      text,
    });
    throw error;
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (closeError) {
        console.warn('Failed to close Worker database connection:', closeError);
      }
    }
  }
};

export default pool;
