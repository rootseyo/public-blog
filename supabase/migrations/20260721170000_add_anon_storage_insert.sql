-- anon 역할에도 INSERT 허용 (앱 레벨에서 isAdmin() 으로 접근 제어)
-- service_role 키가 올바르게 설정되면 이 정책 없이도 동작하나,
-- 키 설정 문제 발생 시 폴백으로 동작함

CREATE POLICY "anon can upload to blog-uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'blog-uploads');
