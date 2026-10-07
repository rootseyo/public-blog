const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load environment variables
const envPath = fs.existsSync(path.join(__dirname, '../.env.production'))
  ? path.join(__dirname, '../.env.production')
  : path.join(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set before creating a backup.');

async function backupBambooPosts() {
  console.log('[Backup] Starting bamboo_posts backup...');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const res = await pool.query('SELECT * FROM bamboo_posts ORDER BY id ASC');
    const backupDir = path.join(__dirname, '../backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = path.join(backupDir, `bamboo_posts_backup_${timestamp}.json`);

    fs.writeFileSync(backupFilePath, JSON.stringify(res.rows, null, 2), 'utf-8');
    console.log(`[Backup] Successfully backed up ${res.rows.length} bamboo_posts records.`);
    console.log(`[Backup] Saved to: ${backupFilePath}`);
    return backupFilePath;
  } catch (error) {
    console.error('[Backup] Backup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  backupBambooPosts()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { backupBambooPosts };
