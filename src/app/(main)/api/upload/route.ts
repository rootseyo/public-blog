import { NextResponse } from 'next/server';
import { isAdmin } from '@/app/(main)/admin/actions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'blog-uploads';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'application/pdf',
]);

function makeStoragePath(originalName: string) {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  // path.extname 대신 순수 문자열 처리 (Cloudflare Workers 호환)
  const dotIndex = originalName.lastIndexOf('.');
  const ext = dotIndex !== -1 ? originalName.slice(dotIndex).toLowerCase() : '';
  const uuid = crypto.randomUUID(); // Web Crypto API (Workers 네이티브)
  return `uploads/${yyyy}/${mm}/${uuid}${ext}`;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 디버그: 어떤 키가 사용되는지 확인 (키 값 노출 없이 앞 20자리만 로그)

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: '파일 크기는 50MB 이하여야 합니다.' }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) return NextResponse.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 });

    const storagePath = makeStoragePath(file.name);
    const { error } = await getSupabaseAdmin().storage.from(BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;

    // storagePath = "uploads/YYYY/MM/{uuid}.ext"
    // proxy at /uploads/[...path] redirects to Supabase CDN
    return NextResponse.json({ url: `/${storagePath}` });
  } catch (error) {
    console.error('Upload failed:', error);
    return NextResponse.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 });
  }
}
