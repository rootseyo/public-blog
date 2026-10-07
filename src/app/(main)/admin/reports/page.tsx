import { query } from '@/lib/db';
import { isAdmin } from '../actions';
import { redirect } from 'next/navigation';
import styles from '../admin.module.css';
import { HorizontalBarChart, BarChart, TrendChart, ReportExporter } from './ReportChartsClient';

export default async function AdminReportsPage() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  // 공통 필터: 내부 IP 및 로컬 환경 유입 제외
  const internalFilter = `
    ip_address != '127.0.0.1' AND 
    ip_address != '::1' AND 
    ip_address NOT LIKE '192.168.%' AND
    referrer NOT LIKE '%localhost%' AND
    referrer NOT LIKE '%127.0.0.1%' AND
    referrer NOT LIKE '%192.168.%'
  `;

  // 1. 많이 읽은 글 Top 10
  const topViewsRes = await query(`
    SELECT title, views as value 
    FROM posts 
    WHERE status != 'deleted'
    ORDER BY views DESC 
    LIMIT 10
  `);
  const topViewsData = topViewsRes.rows.map((row: any) => ({ label: row.title, value: row.value }));

  // 2. 좋아요가 많은 글 Top 10
  const topLikesRes = await query(`
    SELECT title, likes as value 
    FROM posts 
    WHERE status != 'deleted'
    ORDER BY likes DESC 
    LIMIT 10
  `);
  const topLikesData = topLikesRes.rows.map((row: any) => ({ label: row.title, value: row.value }));

  // 3. 최근 90일간 일별 방문자 및 글 발행 수
  const dailyStatsRes = await query(`
    WITH daily_visitors AS (
      SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as visitors 
      FROM visitor_logs 
      WHERE ${internalFilter}
      GROUP BY DATE(created_at)
    ),
    daily_posts AS (
      SELECT DATE(created_at) as date, COUNT(*) as posts
      FROM posts
      WHERE status != 'deleted'
      GROUP BY DATE(created_at)
    )
    SELECT 
      COALESCE(v.date, p.date) as date,
      COALESCE(v.visitors, 0) as visitors,
      COALESCE(p.posts, 0) as posts
    FROM daily_visitors v
    FULL OUTER JOIN daily_posts p ON v.date = p.date
    WHERE COALESCE(v.date, p.date) >= CURRENT_DATE - INTERVAL '90 days'
    ORDER BY date ASC
  `);
  const dailyStatsData = dailyStatsRes.rows.map((row: any) => ({ 
    date: new Date(row.date).toISOString().split('T')[0], 
    visitors: Number(row.visitors),
    posts: Number(row.posts)
  }));

  // 4. 브라우저 분포
  const browserRes = await query(`
    SELECT COALESCE(browser, 'Other') as name, COUNT(*) as value 
    FROM visitor_logs 
    WHERE ${internalFilter}
    GROUP BY browser 
    ORDER BY value DESC
  `);

  // 5. OS 분포
  const osRes = await query(`
    SELECT COALESCE(os, 'Other') as name, COUNT(*) as value 
    FROM visitor_logs 
    WHERE ${internalFilter}
    GROUP BY os 
    ORDER BY value DESC
  `);

  // 6. 디바이스 타입 분포
  const deviceTypeRes = await query(`
    SELECT COALESCE(device_type, 'desktop') as name, COUNT(*) as value 
    FROM visitor_logs 
    WHERE ${internalFilter}
    GROUP BY device_type 
    ORDER BY value DESC
  `);

  // 7. 유입 경로 분포
  const referrerRes = await query(`
    SELECT 
      CASE 
        WHEN referrer = '' OR referrer IS NULL THEN 'Direct'
        WHEN referrer LIKE '%google%' THEN 'Google'
        WHEN referrer LIKE '%naver%' THEN 'Naver'
        WHEN referrer LIKE '%daum%' THEN 'Daum'
        WHEN referrer LIKE '%kakao%' THEN 'Kakao'
        WHEN referrer LIKE '%facebook%' THEN 'Facebook'
        WHEN referrer LIKE '%t.co%' OR referrer LIKE '%twitter%' THEN 'Twitter/X'
        ELSE 'Other'
      END as name,
      COUNT(*) as value
    FROM visitor_logs
    WHERE ${internalFilter}
    GROUP BY name
    ORDER BY value DESC
  `);

  // 7-1. 카테고리별 글 분포
  const categoryDistRes = await query(`
    SELECT COALESCE(c.name, 'Uncategorized') as name, COUNT(p.id) as value
    FROM posts p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status != 'deleted'
    GROUP BY c.name
    ORDER BY value DESC
  `);

  // 8. 가장 많이 본 글의 상세 분석 (Top 1)
  const topPost = await query(`SELECT id, title FROM posts WHERE status != 'deleted' ORDER BY views DESC LIMIT 1`);
  let topPostDetails = null;
  if (topPost.rows.length > 0) {
    const postId = topPost.rows[0].id;
    const topPostTitle = topPost.rows[0].title;

    const [tpReferrer] = await Promise.all([
      query(`
        SELECT 
          COALESCE(NULLIF(referrer, ''), 'Direct') as name, 
          COUNT(*) as value 
        FROM visitor_logs 
        WHERE post_id = $1 AND ${internalFilter}
        GROUP BY name ORDER BY value DESC LIMIT 5
      `, [postId])
    ]);

    topPostDetails = {
      title: topPostTitle,
      referrers: tpReferrer.rows
    };
  }

  // 9. 특정 날짜(4월 29일) 분석
  const targetDate = '2026-04-29';
  const targetDateStats = await Promise.all([
    query(`SELECT title FROM posts WHERE DATE(created_at) = $1 AND status != 'deleted'`, [targetDate]),
    query(`
      SELECT p.title, COUNT(*) as views 
      FROM visitor_logs vl 
      JOIN posts p ON vl.post_id = p.id 
      WHERE DATE(vl.created_at) = $1 
      GROUP BY p.title ORDER BY views DESC LIMIT 1
    `, [targetDate])
  ]);
  const publishedOnTarget = targetDateStats[0].rows;
  const topViewedOnTarget = targetDateStats[1].rows[0];

  // 10. 리포트 요약 데이터 분석
  const totalVisitors = dailyStatsData.reduce((acc: number, curr: any) => acc + curr.visitors, 0);
  const totalPosts90 = dailyStatsData.reduce((acc: number, curr: any) => acc + curr.posts, 0);
  const avgVisitors = Math.round(totalVisitors / (dailyStatsData.length || 1));
  const peakDay = [...dailyStatsData].sort((a, b) => b.visitors - a.visitors)[0];
  const mainReferrer = referrerRes.rows[0]?.name || 'Direct';
  const topCategory = categoryDistRes.rows[0]?.name || 'Uncategorized';
  const mainBrowser = browserRes.rows[0]?.name || 'Unknown';
  const mainDevice = deviceTypeRes.rows[0]?.name || 'desktop';

  const reportId = 'admin-report-content';

  return (
    <div className={styles.container}>
      <div id={reportId} style={{ backgroundColor: 'var(--background)', padding: '20px', borderRadius: '12px' }}>
        <header className={styles.header}>
          <h1 className={styles.title}>통계 리포트 (Stats Report)</h1>
          <div data-html2canvas-ignore="true">
            <ReportExporter elementId={reportId} reportTitle="Blog_Stats_Report" />
          </div>
        </header>

        <section className={styles.section}>
          <div className={`${styles.analyticsCard} ${styles.fullWidthCard}`}>
            <h2 className={styles.cardTitle}>방문자 추이 및 글 발행 현황 (최근 90일)</h2>
            <TrendChart data={dailyStatsData} />
          </div>
        </section>

        <section className={styles.section} style={{ marginTop: '1.25rem' }}>
          <div className={styles.analyticsCard}>
            <h2 className={styles.cardTitle}>리포트 요약 및 인사이트</h2>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.7', color: 'var(--text-muted)' }}>
              <p>• 최근 90일간 총 <strong>{totalVisitors.toLocaleString()}명</strong>의 방문자가 다녀갔으며, 일평균 약 <strong>{avgVisitors}명</strong>이 방문하고 있습니다.</p>
              <p>• 가장 많은 방문자가 몰린 날은 <strong>{peakDay?.date}</strong>로, 하루 동안 <strong>{peakDay?.visitors}명</strong>이 방문했습니다.</p>
              <p>• 이 기간 동안 총 <strong>{totalPosts90}개</strong>의 새로운 콘텐츠가 발행되었습니다.</p>
              
              <p style={{ color: 'var(--foreground)', backgroundColor: 'var(--secondary-bg)', padding: '0.5rem', borderRadius: '4px', margin: '0.5rem 0' }}>
                <strong>📍 4월 29일 하이라이트:</strong> {publishedOnTarget.length > 0 ? (
                  <>이날 <strong>"{publishedOnTarget[0].title}"</strong> 외 {publishedOnTarget.length}개의 글이 발행되었습니다. </>
                ) : (
                  <>이날 새롭게 발행된 글은 없었으나, </>
                )}
                {topViewedOnTarget ? (
                  <>가장 많이 읽힌 글은 <strong>"{topViewedOnTarget.title}"</strong> ({topViewedOnTarget.views}회) 입니다.</>
                ) : (
                  <>조회된 글이 없습니다.</>
                )}
              </p>

              <p>• 주요 유입 경로는 <strong>{mainReferrer}</strong>이며, 방문자들은 주로 <strong>{mainBrowser}</strong> 브라우저와 <strong>{mainDevice}</strong> 기기를 사용합니다.</p>
              <p>• 현재 <strong>{topCategory}</strong> 카테고리에 가장 많은 콘텐츠가 집중되어 있습니다.</p>
            </div>
          </div>
        </section>

        {topPostDetails && (
          <section className={styles.section} style={{ marginTop: '1.25rem' }}>
            <h2 className={styles.sectionTitle}>인기 1위 글 상세 분석: "{topPostDetails.title}"</h2>
            <div className={styles.analyticsGrid} style={{ gridTemplateColumns: '1fr' }}>
              <div className={styles.analyticsCard} style={{ padding: '0.75rem 1rem' }}>
                <h3 className={styles.cardTitle} style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>주요 유입 경로</h3>
                <BarChart data={topPostDetails.referrers} />
              </div>
            </div>
          </section>
        )}

        <div className={styles.analyticsGrid} style={{ marginTop: '2rem' }}>
          <section className={styles.analyticsCard}>
            <h2 className={styles.cardTitle}>가장 많이 본 글 (Views Top 10)</h2>
            <HorizontalBarChart data={topViewsData} />
          </section>

          <section className={styles.analyticsCard}>
            <h2 className={styles.cardTitle}>좋아요를 가장 많이 받은 글 (Likes Top 10)</h2>
            <HorizontalBarChart data={topLikesData} />
          </section>
        </div>

        <section className={styles.sectionTitle}>방문 환경 및 콘텐츠 분포 분석</section>
        <div className={styles.analyticsGrid} style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem' }}>
          <div className={styles.analyticsCard} style={{ gridColumn: 'span 2', padding: '0.75rem 1rem' }}>
            <h3 className={styles.cardTitle} style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>카테고리별 글 분포</h3>
            <BarChart data={categoryDistRes.rows} />
          </div>
          <div className={styles.analyticsCard} style={{ gridColumn: 'span 2', padding: '0.75rem 1rem' }}>
            <h3 className={styles.cardTitle} style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>유입 경로</h3>
            <BarChart data={referrerRes.rows} />
          </div>
          <div className={styles.analyticsCard} style={{ gridColumn: 'span 2', padding: '0.75rem 1rem' }}>
            <h3 className={styles.cardTitle} style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>브라우저</h3>
            <BarChart data={browserRes.rows} />
          </div>
          
          <div className={styles.analyticsCard} style={{ gridColumn: 'span 3', padding: '0.75rem 1rem' }}>
            <h3 className={styles.cardTitle} style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>OS</h3>
            <BarChart data={osRes.rows} />
          </div>
          <div className={styles.analyticsCard} style={{ gridColumn: 'span 3', padding: '0.75rem 1rem' }}>
            <h3 className={styles.cardTitle} style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>디바이스</h3>
            <BarChart data={deviceTypeRes.rows} />
          </div>
        </div>
      </div>
    </div>
  );
}
