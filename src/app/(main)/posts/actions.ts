'use server';

import { query } from '@/lib/db';
import { headers, cookies } from 'next/headers';
import crypto from 'crypto';
import { getDeviceType, getOS, getBrowser, getDeviceModel, isCrawlerOrBot } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { isAdmin } from '../admin/actions';

export async function logVisit(
  postId?: number, 
  path: string = '/', 
  clientReferrer?: string,
  customUserAgent?: string
) {
  const headerList = await headers();
  const cookieStore = await cookies();
  
  const ip = headerList.get('x-forwarded-for')?.split(',')[0] || 
             headerList.get('x-real-ip') || 
             'unknown';
  const userAgent = customUserAgent || headerList.get('user-agent') || 'unknown';
  
  // Use clientReferrer if available, otherwise fallback to headers.
  const referrer = clientReferrer || headerList.get('referer') || '';
  
  // Skip logging for internal traffic (Only localhost/loopback)
  const isInternal = 
    ip === '127.0.0.1' || 
    ip === '::1' || 
    referrer.includes('localhost') || 
    referrer.includes('127.0.0.1');

  if (isInternal && !customUserAgent) return;

  // Use cookie for more accurate visitor identification
  let visitorId = cookieStore.get('visitor_id')?.value;
  
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    cookieStore.set('visitor_id', visitorId, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  // Simple session identification - combine visitorId with today's date
  const today = new Date().toISOString().split('T')[0];
  const sessionId = crypto.createHash('md5')
    .update(`${visitorId}-${today}`)
    .digest('hex');

  const isBot = isCrawlerOrBot(userAgent);
  const deviceType = getDeviceType(userAgent);
  const os = getOS(userAgent);
  const browser = getBrowser(userAgent);
  const deviceModel = getDeviceModel(userAgent);

  try {
    // 1. 일반 방문 중복 체크 (쿠키 사용)
    const sessionCookieName = `v_${sessionId}`;
    const hasVisitedToday = cookieStore.has(sessionCookieName);

    // 2. 글 읽기 중복 체크 (쿠키 사용)
    let hasViewedPostToday = false;
    if (postId) {
      const postCookieName = `p_${postId}_${today}`;
      hasViewedPostToday = cookieStore.has(postCookieName);
    }

    // 새로운 세션이거나 새로운 글을 읽는 경우에만 visitor_logs에 기록
    if (!hasVisitedToday || (postId && !hasViewedPostToday)) {
      const res: any = await query(
        'INSERT INTO visitor_logs (session_id, post_id, path, ip_address, user_agent, referrer, device_type, os, browser, device_model, is_bot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [sessionId, postId || null, path, ip, userAgent, referrer, deviceType, os, browser, deviceModel, isBot]
      );

      // DB 연결 불가 등으로 쿼리가 스킵된 경우 종료
      if (res.skipped) return;

      // 일반 방문 쿠키 설정 (24시간)
      if (!hasVisitedToday) {
        cookieStore.set(sessionCookieName, '1', {
          maxAge: 60 * 60 * 24,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
      }
    }

    if (postId && !hasViewedPostToday) {
      // 봇이 아닌 실제 사용자 읽기인 경우에만 post views 조회수 증가
      if (!isBot) {
        const dailyKey = `${visitorId}-${postId}-${today}`;
        const uniqueViewRes = await query(
          'INSERT INTO post_views (post_id, ip_address) VALUES ($1, $2) ON CONFLICT (post_id, ip_address) DO NOTHING RETURNING id',
          [postId, dailyKey]
        );
        
        if (uniqueViewRes.rows.length > 0) {
          await query('UPDATE posts SET views = views + 1 WHERE id = $1', [postId]);
          
          revalidatePath('/');
          revalidatePath('/admin');
          revalidatePath('/posts/[slug]', 'page');
        }
      }

      // 글 읽기 쿠키 설정 (24시간)
      cookieStore.set(`p_${postId}_${today}`, '1', {
        maxAge: 60 * 60 * 24,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
  } catch (error) {
    console.error('Error logging visit:', error);
  }
}

export async function incrementViewCount(postId: number) {
  return logVisit(postId, `/posts/${postId}`);
}

export async function likePost(postId: number) {
  try {
    await query('UPDATE posts SET likes = COALESCE(likes, 0) + 1 WHERE id = $1', [postId]);
    
    // 캐시 갱신
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/posts/[slug]', 'page');
    
    return { success: true };
  } catch (error) {
    console.error('Error liking post:', error);
    return { success: false };
  }
}

export async function unlikePost(postId: number) {
  try {
    await query('UPDATE posts SET likes = GREATEST(0, COALESCE(likes, 0) - 1) WHERE id = $1', [postId]);
    
    // 캐시 갱신
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/posts/[slug]', 'page');
    
    return { success: true };
  } catch (error) {
    console.error('Error unliking post:', error);
    return { success: false };
  }
}

export async function getComments(postId: number, includeReported: boolean = false) {
  try {
    const admin = await isAdmin();
    const queryStr = includeReported 
      ? 'SELECT id, author_name, content, is_admin, is_private, reports, likes, created_at, deleted_at FROM comments WHERE post_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC'
      : 'SELECT id, author_name, content, is_admin, is_private, likes, created_at FROM comments WHERE post_id = $1 AND reports < 2 AND deleted_at IS NULL ORDER BY created_at ASC';
    
    const res = await query(queryStr, [postId]);
    
    // 비밀 댓글 처리: 관리자가 아니면 내용을 숨김
    const processedRows = res.rows.map((row: any) => {
      if (row.is_private && !admin) {
        return { ...row, content: '비밀 댓글입니다.' };
      }
      return row;
    });
    
    return processedRows;
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

export async function addComment(postId: number, formData: FormData) {
  const authorName = formData.get('authorName') as string;
  const content = formData.get('content') as string;
  const password = formData.get('password') as string;
  const isAdminComment = formData.get('isAdmin') === 'true';
  const isPrivate = formData.get('isPrivate') === 'true';

  if (!authorName || !content || (!password && !isAdminComment)) {
    return { success: false, error: '모든 필드를 입력해주세요.' };
  }

  if (authorName.length > 20) return { success: false, error: '이름은 20자 이내로 입력해주세요.' };
  if (content.length > 1000) return { success: false, error: '내용은 1000자 이내로 입력해주세요.' };

  try {
    // 비밀번호 해싱 (간단하게 구현)
    const hashedPassword = password ? crypto.createHash('sha256').update(password).digest('hex') : 'admin-post';

    await query(
      'INSERT INTO comments (post_id, author_name, content, password, is_admin, is_private) VALUES ($1, $2, $3, $4, $5, $6)',
      [postId, authorName, content, hashedPassword, isAdminComment, isPrivate]
    );

    revalidatePath('/posts/[slug]', 'page');
    // 최신 댓글 ID 가져오기
    const res = await query('SELECT id FROM comments WHERE post_id = $1 ORDER BY id DESC LIMIT 1', [postId]);
    return { success: true, id: res.rows[0].id };
  } catch (error) {
    console.error('Error adding comment:', error);
    return { success: false, error: '댓글 저장 중 오류가 발생했습니다.' };
  }
}

export async function updateComment(commentId: number, formData: FormData) {
  const content = formData.get('content') as string;
  const password = formData.get('password') as string;

  if (!content || !password) return { success: false, error: '내용과 비밀번호를 입력해주세요.' };

  try {
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const res = await query(
      'UPDATE comments SET content = $1 WHERE id = $2 AND password = $3',
      [content, commentId, hashedPassword]
    );

    if (res.rowCount === 0) return { success: false, error: '비밀번호가 일치하지 않습니다.' };
    
    revalidatePath('/posts/[slug]', 'page');
    return { success: true };
  } catch (error) {
    console.error('Error updating comment:', error);
    return { success: false, error: '댓글 수정 중 오류 발생' };
  }
}

export async function reportComment(commentId: number) {
  try {
    await query('UPDATE comments SET reports = reports + 1 WHERE id = $1', [commentId]);
    revalidatePath('/posts/[slug]', 'page');
    return { success: true };
  } catch (error) {
    return { success: false, error: '신고 처리 중 오류 발생' };
  }
}

export async function deleteComment(commentId: number, password?: string, isAdmin: boolean = false) {
  try {
    if (isAdmin) {
      await query('UPDATE comments SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [commentId]);
      revalidatePath('/posts/[slug]', 'page');
      return { success: true };
    }

    if (!password) return { success: false, error: '비밀번호가 필요합니다.' };

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const res = await query(
      'UPDATE comments SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND password = $2',
      [commentId, hashedPassword]
    );

    if (res.rowCount === 0) {
      return { success: false, error: '비밀번호가 일치하지 않습니다.' };
    }

    revalidatePath('/posts/[slug]', 'page');
    return { success: true };
  } catch (error) {
    console.error('Error deleting comment:', error);
    return { success: false, error: '댓글 삭제 중 오류가 발생했습니다.' };
  }
}

export async function getCommentContent(commentId: number, password?: string) {
  try {
    const admin = await isAdmin();
    if (admin) {
      const res = await query('SELECT content FROM comments WHERE id = $1', [commentId]);
      return { success: true, content: res.rows[0]?.content };
    }

    if (!password) return { success: false, error: '비밀번호가 필요합니다.' };

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const res = await query(
      'SELECT content FROM comments WHERE id = $1 AND password = $2',
      [commentId, hashedPassword]
    );

    if (res.rows.length === 0) {
      return { success: false, error: '비밀번호가 일치하지 않거나 댓글이 존재하지 않습니다.' };
    }

    return { success: true, content: res.rows[0].content };
  } catch (error) {
    console.error('Error fetching comment content:', error);
    return { success: false, error: '내용을 가져오는 중 오류가 발생했습니다.' };
  }
}

export async function likeComment(commentId: number) {
  try {
    await query('UPDATE comments SET likes = COALESCE(likes, 0) + 1 WHERE id = $1', [commentId]);
    revalidatePath('/posts/[slug]', 'page');
    return { success: true };
  } catch (error) {
    console.error('Error liking comment:', error);
    return { success: false, error: '좋아요 처리 중 오류 발생' };
  }
}
