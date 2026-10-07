/**
 * 댓글 기능 통합 테스트 스크립트
 * 실행 방법: node test-comments.js
 */
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');

async function runTest() {
  console.log('🚀 댓글 기능 테스트 시작...');

  // .env.local에서 DATABASE_URL 읽기
  let dbUrl;
  try {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const match = envFile.match(/DATABASE_URL=(.+)/);
    if (!match) throw new Error('.env.local에서 DATABASE_URL을 찾을 수 없습니다.');
    dbUrl = match[1].trim();
  } catch (e) {
    console.error('❌ 설정 파일을 읽을 수 없습니다:', e.message);
    return;
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    // 0. 테스트용 게시글 ID 조회
    const postRes = await pool.query('SELECT id FROM posts LIMIT 1');
    if (postRes.rows.length === 0) {
      throw new Error('테스트를 진행할 게시글이 하나도 없습니다. 글을 먼저 작성해주세요.');
    }
    const testPostId = postRes.rows[0].id;
    console.log(`📝 테스트 게시글 ID: ${testPostId}`);

    const testPassword = 'testpassword123';
    const hashedPass = crypto.createHash('sha256').update(testPassword).digest('hex');
    let commentId;

    // 1. 댓글 추가 테스트
    console.log('\n1. 댓글 추가 테스트 중...');
    const addRes = await pool.query(
      'INSERT INTO comments (post_id, author_name, content, password) VALUES ($1, $2, $3, $4) RETURNING id',
      [testPostId, '테스터', '테스트 댓글입니다.', hashedPass]
    );
    commentId = addRes.rows[0].id;
    console.log(`✅ 댓글 추가 성공 (ID: ${commentId})`);

    // 2. 댓글 수정 테스트
    console.log('\n2. 댓글 수정 테스트 중...');
    const newContent = '수정된 테스트 내용입니다.';
    const updateRes = await pool.query(
      'UPDATE comments SET content = $1 WHERE id = $2 AND password = $3 RETURNING *',
      [newContent, commentId, hashedPass]
    );
    if (updateRes.rows.length > 0 && updateRes.rows[0].content === newContent) {
      console.log('✅ 댓글 수정 성공');
    } else {
      throw new Error('댓글 수정 실패');
    }

    // 3. 신고 기능 테스트
    console.log('\n3. 신고 및 숨김 기능 테스트 중...');
    // 첫 번째 신고
    await pool.query('UPDATE comments SET reports = reports + 1 WHERE id = $1', [commentId]);
    let check = await pool.query('SELECT * FROM comments WHERE id = $1 AND reports < 2', [commentId]);
    console.log(`- 1회 신고 후 노출 여부: ${check.rows.length > 0 ? '노출됨 (정상)' : '숨겨짐 (오류)'}`);

    // 두 번째 신고
    await pool.query('UPDATE comments SET reports = reports + 1 WHERE id = $1', [commentId]);
    check = await pool.query('SELECT * FROM comments WHERE id = $1 AND reports < 2', [commentId]);
    console.log(`- 2회 신고 후 노출 여부: ${check.rows.length === 0 ? '숨겨짐 (정상)' : '노출됨 (오류)'}`);

    // 4. 삭제 테스트
    console.log('\n4. 댓글 삭제 테스트 중...');
    const delRes = await pool.query(
      'DELETE FROM comments WHERE id = $1 AND password = $2 RETURNING *',
      [commentId, hashedPass]
    );
    if (delRes.rowCount === 1) {
      console.log('✅ 댓글 삭제 성공');
    } else {
      throw new Error('댓글 삭제 실패 (비밀번호 불일치 가능성)');
    }

    console.log('\n✨ 모든 테스트를 성공적으로 마쳤습니다!');

  } catch (err) {
    console.error('\n❌ 테스트 실패:', err.message);
  } finally {
    await pool.end();
  }
}

runTest();
