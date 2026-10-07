import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import styles from "./layout.module.css";
import { Globe } from "lucide-react";
import { getPopularPosts } from "@/app/(main)/admin/editor/actions";
import { getCategories } from "@/app/(main)/admin/actions";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/site-url";

const siteKeywords = [
  'Bright Notes',
  'AI',
  '인공지능',
  'ChatGPT',
  'OpenAI',
  'Codex',
  'Cloudflare',
  'Supabase',
  'JavaScript',
  'TypeScript',
  'React',
  '개발',
  '프로그래밍',
  '투자',
  '미국주식',
  'ETF',
  '리더십',
  '생산성',
  '기술블로그',
  '개발자블로그',
  '프로그래밍블로그',
  'AI블로그',
  'Cloudflare Workers',
  '웹개발'
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Bright Notes | AI, 개발, 투자 그리고 생각을 기록하는 기술 블로그",
  description: "Bright Notes는 AI, 소프트웨어 개발, 투자, 리더십, 생산성 그리고 일상의 생각을 기록하는 기술 블로그입니다. 실제 경험과 실험을 바탕으로 얻은 인사이트를 공유합니다.",
  keywords: siteKeywords,
  openGraph: {
    title: "Bright Notes | AI, 개발, 투자 그리고 생각을 기록하는 기술 블로그",
    description: "Bright Notes는 AI, 소프트웨어 개발, 투자, 리더십, 생산성 그리고 일상의 생각을 기록하는 기술 블로그입니다. 실제 경험과 실험을 바탕으로 얻은 인사이트를 공유합니다.",
    type: "website",
    siteName: "Bright Notes",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bright Notes | AI, 개발, 투자 그리고 생각을 기록하는 기술 블로그",
    description: "Bright Notes는 AI, 소프트웨어 개발, 투자, 리더십, 생산성 그리고 일상의 생각을 기록하는 기술 블로그입니다. 실제 경험과 실험을 바탕으로 얻은 인사이트를 공유합니다.",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [popularPosts, categories] = await Promise.all([
    getPopularPosts(),
    getCategories(false)
  ]);
  
  // 관리자 페이지 여부 확인
  const headersList = await headers();
  const pathname = headersList.get("x-invoke-path") || "";
  const isAdminPage = pathname.startsWith('/admin');

  return (
    <html lang="ko">
      <head>
      </head>
      <body>
        <Navbar popularPosts={popularPosts} categories={categories} />
        
        <div className={isAdminPage ? styles.adminContainer : styles.mainContainer}>
          {isAdminPage ? (
            children
          ) : (
            <>
              <main style={{ flex: 1, minWidth: 0 }}>
                {children}
              </main>
              <Sidebar popularPosts={popularPosts} />
            </>
          )}
        </div>

        <footer style={{ 
          borderTop: '1px solid #f0f0f0',
          marginTop: '4rem',
          width: '100%'
        }}>
          <div style={{
            maxWidth: isAdminPage ? '1200px' : '1200px',
            margin: '0 auto',
            padding: '4rem 1.5rem 2rem',
            textAlign: 'center',
            color: '#888',
            fontSize: '0.9rem',
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '1.5rem', 
              marginBottom: '1.5rem' 
            }}>
              <a href="/" className="footer-social-link" aria-label="Home">
                <Globe size={20} />
              </a>
            </div>
            <p>© {new Date().getFullYear()} Bright Notes. All rights reserved.</p>
          </div>
        </footer>

        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.7/kakao.min.js"
          integrity="sha384-tJkjbtDbvoxO+diRuDtwRO9JXR7pjWnfjfRn5ePUpl7e7RJCxKCwwnfqUAdXh53p"
          crossOrigin="anonymous"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
