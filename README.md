# Public Blog

Cloudflare Workers와 Supabase로 운영하는 오픈소스 개인 블로그 애플리케이션입니다. 글 편집기, 카테고리, 댓글, 이미지 업로드, SEO 메타데이터, 사이트맵을 포함합니다.

> 이 프로젝트는 **블로그 한 개를 독립 배포하는 셀프 호스팅 앱**입니다. 가입형 멀티테넌트 서비스와 사용자별 커스텀 도메인 연결은 포함하지 않습니다.

## 기술 구성

- Next.js App Router
- Cloudflare Workers + OpenNextJS
- Supabase PostgreSQL 및 Storage
- PostgreSQL 드라이버를 통한 서버 측 데이터 접근

## 로컬 개발

1. Node.js 20 이상과 npm을 설치합니다.
2. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/migrations/`의 migration 파일을 순서대로 실행합니다.
3. Supabase Storage에 `blog-uploads` 버킷을 만들고 공개 읽기 정책을 설정합니다. 업로드는 서버의 service role 키로 처리합니다.
4. 개발 환경 파일을 만들고 값을 채웁니다.

   ```sh
   cp .env.example .env.local
   ```

5. 패키지를 설치하고 개발 서버를 실행합니다.

   ```sh
   npm ci
   npm run dev
   ```

`http://localhost:3000`에서 확인할 수 있습니다.

## Cloudflare 배포

1. `wrangler.jsonc`의 Worker 이름, Supabase URL, `SITE_URL`을 본인 환경에 맞게 설정합니다. `SITE_URL`은 공개 블로그의 HTTPS 주소입니다.
2. 프로덕션 빌드에서 DB 연결 설정을 읽으므로, 배포 전에 로컬에 빌드용 환경 파일을 준비합니다. 이 파일은 Git에서 제외됩니다.

   ```sh
   cp .env.example .env.production
   ```

   `.env.production`에 실제 Supabase 연결 정보와 관리자 자격 증명을 설정하세요. Kakao 공유 기능을 쓸 경우 `NEXT_PUBLIC_KAKAO_JS_KEY`도 여기에 입력해야 합니다. 이 파일은 저장소에 올리지 마세요.

3. Cloudflare Worker 설정에 다음 공개 변수를 지정합니다.

   - `SITE_URL`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `RUNTIME_PLATFORM=cloudflare`

4. 민감한 값은 Worker secret으로 등록합니다.

   ```sh
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put ADMIN_SESSION_SECRET
   npx wrangler secret put CRON_SECRET
   ```

   선택 기능에서 OpenAI, IndexNow, 협업 문의 전송을 사용할 때는 각각 `OPENAI_API_KEY`, `INDEXNOW_KEY`, `SLACK_WEBHOOK_URL`을 등록합니다. API Bearer 인증도 사용할 경우에만 `ADMIN_SECRET`을 추가하세요.

5. 미리보기와 운영 배포를 실행합니다.

   ```sh
   npm run cf:preview
   npm run cf:deploy
   ```

Worker에 연결할 사용자 도메인은 Cloudflare DNS와 `wrangler.jsonc` 라우트에 직접 설정합니다. 자동 인증서 발급을 포함한 최종 사용자별 도메인 연결은 이 앱의 기능 범위가 아닙니다.

## 관리자 계정

관리자 로그인은 Worker secrets의 `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`을 사용합니다. 비밀번호와 세션 서명키는 서로 다른 강한 값으로 설정하세요. 세션은 서명 및 만료 검증을 거칩니다. 이 프로젝트는 한 명의 블로그 소유자를 위한 인증이며, 여러 계정이나 회원 가입 기능은 제공하지 않습니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | Next.js 개발 서버 |
| `npm run build` | Next.js 프로덕션 빌드 |
| `npm run cf:preview` | Cloudflare 로컬 미리보기 |
| `npm run cf:deploy` | Cloudflare Workers 배포 |

## 보안 및 데이터

- `.env.local`, `.env.production`, 데이터베이스 백업, 업로드 파일, 서비스 계정 키는 저장소에 추가하지 마세요.
- Supabase service role 키와 `DATABASE_URL`은 서버 전용 비밀값입니다.
- 스키마 변경은 새 migration으로 관리합니다.
- 앱은 단일 관리자·단일 블로그 배포를 전제로 하며, 가입 사용자 간 데이터 격리를 제공하지 않습니다.

## 라이선스

MIT License. 자세한 내용은 [LICENSE](LICENSE)를 참고하세요.
