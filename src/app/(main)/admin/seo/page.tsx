import { isAdmin } from '../actions';
import { redirect } from 'next/navigation';
import styles from '../admin.module.css';
import IndexNowButton from '../IndexNowButton';
import IndexingSchedulerPanel from './IndexingSchedulerPanel';
import Link from 'next/link';

export default async function SeoOptimizationPage() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>SEO 최적화</h1>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Automated Daily Indexing Scheduler Panel */}
        <section>
          <IndexingSchedulerPanel />
        </section>

        {/* Bing IndexNow Section */}
        <section className={styles.analyticsCard}>
          <h3 className={styles.cardTitle}>Bing IndexNow 대기열 전송</h3>
          <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            IndexNow는 검색 엔진에 웹사이트의 최신 콘텐츠 변경 사항을 즉시 알리는 프로토콜입니다.
            발행·수정된 URL만 대기열에 쌓이며, 버튼을 클릭하면 대기 중인 URL만 전송합니다.
          </p>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <IndexNowButton />
          </div>
        </section>

        {/* Google indexing guidance */}
        <section className={styles.analyticsCard}>
          <h3 className={styles.cardTitle}>Google 검색 반영</h3>
          <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1.5rem', lineHeight: '1.6' }}>
            일반 블로그 글은 Google Indexing API 대상이 아닙니다. 아래 sitemap.xml을 Search Console에 제출하고,
            긴급한 개별 URL은 Search Console의 URL 검사 도구에서 재크롤링을 요청하세요.
          </p>
        </section>

        {/* Other SEO Resources */}
        <section className={styles.analyticsCard}>
          <h3 className={styles.cardTitle}>SEO 리소스 확인</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            <a 
              href="/robots.txt" 
              target="_blank" 
              className={styles.editButton}
              style={{ padding: '1rem', height: 'auto', textAlign: 'center' }}
            >
              robots.txt 보기
            </a>
            {/* Sitemap is usually generated dynamically or exists at /sitemap.xml */}
            <a 
              href="/sitemap.xml" 
              target="_blank" 
              className={styles.editButton}
              style={{ padding: '1rem', height: 'auto', textAlign: 'center' }}
            >
              sitemap.xml 보기
            </a>
          </div>
        </section>

        <section className={styles.analyticsCard}>
          <h3 className={styles.cardTitle}>SEO 팁</h3>
          <ul style={{ fontSize: '0.875rem', color: '#555', lineHeight: '1.8', paddingLeft: '1.2rem' }}>
            <li>각 게시글의 <strong>메타 타이틀</strong>과 <strong>메타 설명</strong>을 꼭 입력하세요.</li>
            <li>이미지 업로드 시 <strong>Alt 텍스트(설명)</strong>를 입력하면 검색 엔진 최적화에 도움이 됩니다.</li>
            <li>슬러그(URL)는 의미 있는 단어와 하이픈(-) 조합으로 작성하는 것이 좋습니다.</li>
            <li>글 내부에 관련 있는 다른 글의 링크를 넣는 <strong>내부 링크</strong> 전략을 활용하세요.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
