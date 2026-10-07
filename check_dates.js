const { Client } = require('pg');

async function checkBadDates() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const res = await client.query("SELECT id, title, published_at, created_at, updated_at FROM posts");
    
    for (const post of res.rows) {
      try {
        if (post.published_at) new Date(post.published_at).toISOString();
        if (post.created_at) new Date(post.created_at).toISOString();
        if (post.updated_at) new Date(post.updated_at).toISOString();
      } catch (e) {
        console.log(`Post ID ${post.id} has invalid date:`, {
          title: post.title,
          published_at: post.published_at,
          created_at: post.created_at,
          updated_at: post.updated_at
        });
      }
    }
    console.log('Check complete.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkBadDates();
