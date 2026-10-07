-- Storage RLS policies for blog-uploads bucket
-- service_role 키로 업로드 허용, 공개 읽기 허용

-- 업로드(INSERT): service_role 전용
CREATE POLICY "service_role can upload to blog-uploads"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'blog-uploads');

-- 수정(UPDATE): service_role 전용
CREATE POLICY "service_role can update blog-uploads"
ON storage.objects
FOR UPDATE
TO service_role
USING (bucket_id = 'blog-uploads');

-- 삭제(DELETE): service_role 전용
CREATE POLICY "service_role can delete from blog-uploads"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'blog-uploads');

-- 읽기(SELECT): 공개 (버킷이 public=true이므로 CDN 접근 허용)
CREATE POLICY "public can read blog-uploads"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'blog-uploads');
