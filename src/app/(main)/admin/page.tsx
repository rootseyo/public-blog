import { query } from '@/lib/db';
import { redirect } from 'next/navigation';
import styles from './admin.module.css';
import VisitorChart from './VisitorChartClient';
import UserJourneyFlowClient from './UserJourneyFlowClient';
import { permanentlyDeleteOldPosts, cleanupInternalLogs, runMigrations, isAdmin } from './actions';

export default async function AdminDashboard() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  // 관리자 접속 시 주기적 정리 및 마이그레이션 작업
  await Promise.all([
    permanentlyDeleteOldPosts(),
    cleanupInternalLogs(),
    runMigrations()
  ]);

  // 공통 필터: 내부 IP 및 로컬 환경 유입 제외
  const internalFilter = `
    ip_address != '127.0.0.1' AND 
    ip_address != '::1' AND 
    ip_address NOT LIKE '192.168.%' AND
    referrer NOT LIKE '%localhost%' AND
    referrer NOT LIKE '%127.0.0.1%' AND
    referrer NOT LIKE '%192.168.%'
  `;

  // 1. 전체 방문자 수 날짜별 (최근 30일)
  const dailyVisitorsRes = await query(`
    SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as visitors 
    FROM visitor_logs 
    WHERE ${internalFilter}
    GROUP BY DATE(created_at) 
    ORDER BY date DESC 
    LIMIT 30
  `);

  // 2. 많이 읽은 글 순위
  const topPostsRes = await query(`
    SELECT p.id, p.title, p.views, COUNT(DISTINCT vl.session_id) as unique_visitors
    FROM posts p
    LEFT JOIN visitor_logs vl ON p.id = vl.post_id AND ${internalFilter.replace(/ip_address/g, 'vl.ip_address').replace(/referrer/g, 'vl.referrer')}
    GROUP BY p.id, p.title, p.views
    ORDER BY p.views DESC
    LIMIT 10
  `);

  // 3. 유입경로 (Referrer) - Top 30
  const referrersRes = await query(`
    SELECT COALESCE(NULLIF(referrer, ''), 'Direct') as source, COUNT(*) as count
    FROM visitor_logs
    WHERE ${internalFilter}
    GROUP BY source
    ORDER BY count DESC
    LIMIT 30
  `);

  // 4. 브라우저 (Browser)
  const browsersRes = await query(`
    SELECT COALESCE(browser, 'Other') as browser, COUNT(*) as count
    FROM visitor_logs
    WHERE ${internalFilter}
    GROUP BY browser
    ORDER BY count DESC
  `);

  // 4-1. OS (Operating System)
  const osRes = await query(`
    SELECT COALESCE(os, 'Other') as os, COUNT(*) as count
    FROM visitor_logs
    WHERE ${internalFilter}
    GROUP BY os
    ORDER BY count DESC
  `);

  // 4-2. 상세 디바이스 (Device Model)
  const deviceModelsRes = await query(`
    SELECT COALESCE(device_model, 'Unknown') as model, COUNT(*) as count
    FROM visitor_logs
    WHERE ${internalFilter} AND device_model != 'Unknown'
    GROUP BY model
    ORDER BY count DESC
    LIMIT 10
  `);

  // 5. 사용자 여정 플로우 데이터 (User Journey Flow)
  const journeyRes = await query(`
    WITH session_paths AS (
      SELECT 
        vl.session_id,
        COALESCE(p.title, vl.path) as page_name,
        vl.referrer,
        vl.created_at,
        ROW_NUMBER() OVER (PARTITION BY vl.session_id ORDER BY vl.created_at) as step_num
      FROM visitor_logs vl
      LEFT JOIN posts p ON vl.post_id = p.id
      WHERE 
        ${internalFilter} AND
        vl.is_bot = false AND
        vl.created_at >= NOW() - INTERVAL '30 days' AND
        vl.path NOT LIKE '/api/%'
      ORDER BY vl.session_id, vl.created_at
    ),
    journey_links AS (
      SELECT 
        CASE 
          WHEN sp1.step_num = 1 THEN
            CASE
              WHEN sp1.referrer IS NULL OR sp1.referrer = '' THEN 'Direct'
              WHEN sp1.referrer LIKE '%naver%' THEN 'Naver'
              WHEN sp1.referrer LIKE '%google%' THEN 'Google'
              WHEN sp1.referrer LIKE '%daum%' THEN 'Daum'
              WHEN sp1.referrer LIKE '%bing%' THEN 'Bing'
              WHEN sp1.referrer LIKE '%yahoo%' THEN 'Yahoo'
              WHEN sp1.referrer LIKE '%t.co%' OR sp1.referrer LIKE '%twitter%' OR sp1.referrer LIKE '%x.com%' THEN 'Twitter/X'
              WHEN sp1.referrer LIKE '%facebook%' OR sp1.referrer LIKE '%fb.com%' THEN 'Facebook'
              WHEN sp1.referrer LIKE '%linkedin%' THEN 'LinkedIn'
              ELSE SUBSTRING(sp1.referrer FROM '://([^/]+)')
            END
          ELSE sp1.page_name || ' [' || sp1.step_num || ']'
        END as source,
        sp2.page_name || ' [' || sp2.step_num || ']' as target,
        sp1.step_num as source_depth
      FROM session_paths sp1
      INNER JOIN session_paths sp2 
        ON sp1.session_id = sp2.session_id 
        AND sp2.step_num = sp1.step_num + 1
    )
    SELECT source, target, COUNT(*) as value, MIN(source_depth) as depth
    FROM journey_links
    GROUP BY source, target
    HAVING COUNT(*) >= 1
    ORDER BY depth, value DESC
  `);

  // 여정 데이터 가공
  const journeyLinks = journeyRes.rows.map((row: any) => ({
    source: row.source,
    target: row.target,
    value: Number(row.value)
  }));

  const journeyNodeNames = new Set<string>();
  journeyLinks.forEach((link: any) => {
    journeyNodeNames.add(link.source);
    journeyNodeNames.add(link.target);
  });

  const journeyNodes = Array.from(journeyNodeNames).map(name => ({ name }));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Admin Dashboard</h1>
      </header>

      <h2 className={styles.sectionTitle}>방문 분석 (Analytics)</h2>
      <div className={styles.analyticsGrid}>
        {/* 전체 방문자 (Full Width) */}
        <div className={`${styles.analyticsCard} ${styles.fullWidthCard}`}>
          <h3 className={styles.cardTitle}>전체 방문자 (최근 30일)</h3>
          {dailyVisitorsRes.rows.length > 0 ? (
            <VisitorChart data={dailyVisitorsRes.rows} />
          ) : (
            <p style={{color: '#999', fontSize: '0.8rem', padding: '1rem'}}>데이터가 없습니다.</p>
          )}
        </div>

        {/* 유입 경로 (Full Width) */}
        <div className={`${styles.analyticsCard} ${styles.fullWidthCard}`}>
          <h3 className={styles.cardTitle}>유입 경로 (Top 30)</h3>
          <ul className={`${styles.statList} ${styles.scrollableList}`}>
            {referrersRes.rows.map((row: any, i: number) => (
              <li key={i} className={styles.statItem}>
                <span className={styles.statLabel} style={{ maxWidth: '500px' }} title={row.source}>{row.source}</span>
                <span className={styles.statValue}>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 사용자 여정 플로우 (Full Width) */}
        <div className={`${styles.analyticsCard} ${styles.fullWidthCard}`}>
          <h3 className={styles.cardTitle}>사용자 여정 플로우 (User Journey)</h3>
          <p style={{fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.5rem'}}>
            유입 소스 → 첫 페이지 → 이동 페이지 흐름 (최근 30일)
          </p>
          {journeyLinks.length > 0 ? (
            <UserJourneyFlowClient nodes={journeyNodes} links={journeyLinks} />
          ) : (
            <p style={{color: '#999', fontSize: '0.8rem', padding: '1rem'}}>여정 데이터가 없습니다.</p>
          )}
        </div>

        {/* 환경 및 디바이스 정보 (Full Width or 2/3 depending on Grid) */}
        <div className={`${styles.analyticsCard} ${styles.fullWidthCard}`}>
          <h3 className={styles.cardTitle}>방문 환경 및 디바이스 (Technology)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
            <div>
              <p className={styles.miniTitle}>Browsers</p>
              <ul className={styles.statList}>
                {browsersRes.rows.map((row: any, i: number) => (
                  <li key={i} className={styles.statItem} style={{fontSize: '0.8rem'}}>
                    <span className={styles.statLabel}>{row.browser}</span>
                    <span className={styles.statValue}>{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className={styles.miniTitle}>OS</p>
              <ul className={styles.statList}>
                {osRes.rows.map((row: any, i: number) => (
                  <li key={i} className={styles.statItem} style={{fontSize: '0.8rem'}}>
                    <span className={styles.statLabel}>{row.os}</span>
                    <span className={styles.statValue}>{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className={styles.miniTitle}>Devices</p>
              <ul className={styles.statList}>
                {deviceModelsRes.rows.map((row: any, i: number) => (
                  <li key={i} className={styles.statItem} style={{fontSize: '0.8rem'}}>
                    <span className={styles.statLabel} title={row.model}>{row.model}</span>
                    <span className={styles.statValue}>{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* 인기 글 순위 (Full Width or 1/2 row if preferred) */}
        <div className={`${styles.analyticsCard} ${styles.fullWidthCard}`}>
          <h3 className={styles.cardTitle}>많이 읽은 글 (Top 10)</h3>
          <ul className={styles.statList}>
            {topPostsRes.rows.map((row: any, i: number) => (
              <li key={i} className={styles.statItem} style={{ borderBottom: '1px solid var(--secondary-bg)', padding: '0.75rem 0' }}>
                <span className={styles.statLabel} style={{ maxWidth: 'none', overflow: 'visible', whiteSpace: 'normal', flex: 1, paddingRight: '1rem', color: 'var(--foreground)' }}>
                  {row.title}
                </span>
                <span className={styles.statValue} style={{ whiteSpace: 'nowrap' }}>{row.views}회</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
