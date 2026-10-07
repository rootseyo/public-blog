'use client';

import { useState, useEffect } from 'react';
import { 
  getIndexingSchedule, 
  updateIndexingSchedule, 
  getIndexingLogs, 
  triggerManualIndexing 
} from '../actions';

interface LogEntry {
  id: number;
  trigger_type: string;
  status: string;
  message: string;
  url_count: number;
  created_at: string;
}

export default function IndexingSchedulerPanel() {
  const [enabled, setEnabled] = useState(true);
  const [scheduledHour, setScheduledHour] = useState(3);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load initial settings and logs
  const loadData = async () => {
    setIsLoading(true);
    try {
      const scheduleRes = await getIndexingSchedule();
      if (scheduleRes.success && scheduleRes.schedule) {
        setEnabled(scheduleRes.schedule.enabled);
        setScheduledHour(scheduleRes.schedule.scheduled_hour);
      }
      
      const logsData = await getIndexingLogs();
      setLogs(logsData);
    } catch (err) {
      console.error('Error loading indexing data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setNotification(null);
    try {
      const res = await updateIndexingSchedule(scheduledHour, enabled);
      if (res.success) {
        setNotification({ text: '자동 인덱싱 스케줄 설정이 저장되었습니다.', type: 'success' });
      } else {
        setNotification({ text: res.error || '설정 저장에 실패했습니다.', type: 'error' });
      }
    } catch (err: any) {
      setNotification({ text: err.message || '오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerManual = async () => {
    if (!confirm('전송 대기 중인 변경 URL만 즉시 전송하시겠습니까?')) return;
    
    setIsTriggering(true);
    setNotification(null);
    try {
      const res = await triggerManualIndexing();
      if ('deferred' in res && res.deferred) {
        setNotification({ text: res.message || 'Bing 전송 재시도 대기 중입니다.', type: 'success' });
      } else if (res.success) {
        setNotification({ text: ('message' in res && res.message) || '변경 URL 인덱싱 전송이 완료되었습니다.', type: 'success' });
      } else {
        setNotification({ text: res.error || '수동 전송에 실패했습니다.', type: 'error' });
      }
      setLogs(await getIndexingLogs());
    } catch (err: any) {
      setNotification({ text: err.message || '오류가 발생했습니다.', type: 'error' });
    } finally {
      setIsTriggering(false);
    }
  };

  const refreshLogs = async () => {
    setIsLoading(true);
    try {
      const logsData = await getIndexingLogs();
      setLogs(logsData);
    } catch (err) {
      console.error('Error refreshing logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Settings Section */}
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #e2e8f0)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', borderBottom: '2px solid var(--secondary-bg, #f7fafc)', paddingBottom: '0.5rem' }}>
          자동 인덱싱 스케줄 주기 설정 (어플리케이션 내장)
        </h3>

        {notification && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            backgroundColor: notification.type === 'success' ? '#e6fffa' : '#fff5f5',
            color: notification.type === 'success' ? '#2c7a7b' : '#c53030',
            border: `1px solid ${notification.type === 'success' ? '#b2f5ea' : '#fed7d7'}`
          }}>
            {notification.text}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          {/* Active Switch */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
            <input 
              type="checkbox" 
              checked={enabled} 
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
            />
            매일 자동 전송 활성화
          </label>

          {/* Time Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: enabled ? 1 : 0.5, transition: 'opacity 0.2s' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>전송 시간대:</span>
            <select
              value={scheduledHour}
              disabled={!enabled}
              onChange={(e) => setScheduledHour(parseInt(e.target.value))}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e2e8f0)',
                backgroundColor: 'var(--card-bg, #fff)',
                color: 'var(--foreground, #000)',
                fontSize: '0.9rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {Array.from({ length: 24 }).map((_, i) => (
                <option key={i} value={i}>
                  매일 {String(i).padStart(2, '0')}:00시
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleSaveSettings}
            disabled={isSaving || isLoading}
            style={{
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              opacity: isSaving ? 0.7 : 1
            }}
          >
            {isSaving ? '저장 중...' : '스케줄 설정 저장'}
          </button>

          <button
            onClick={handleTriggerManual}
            disabled={isTriggering || isLoading}
            style={{
              backgroundColor: 'transparent',
              color: '#4a5568',
              border: '1px solid var(--border-color, #cbd5e0)',
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              opacity: isTriggering ? 0.7 : 1
            }}
          >
            {isTriggering ? '인덱싱 진행 중...' : '지금 즉시 전송하기'}
          </button>
        </div>
      </div>

      {/* Logs Table Section */}
      <div style={{
        background: 'var(--card-bg, #ffffff)',
        padding: '1.5rem',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #e2e8f0)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '2px solid var(--secondary-bg, #f7fafc)', paddingBottom: '0.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
            최근 인덱싱 스케줄 실행 로그
          </h3>
          <button
            onClick={refreshLogs}
            disabled={isLoading}
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#0070f3',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            🔄 로그 새로고침
          </button>
        </div>

        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#718096', fontSize: '0.9rem' }}>
            최근 인덱싱 전송 로그가 없습니다. 스케줄링 또는 수동 전송이 진행되면 기록됩니다.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #edf2f7)', color: '#718096', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>실행 시간</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>구분</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>전송 URL 개수</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>상태</th>
                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>메시지 / 결과 세부 사항</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color, #f7fafc)', verticalAlign: 'middle' }}>
                    <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap', color: '#4a5568' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: log.trigger_type === 'cron' ? '#ebf8ff' : '#faf5ff',
                        color: log.trigger_type === 'cron' ? '#2b6cb0' : '#553c9a'
                      }}>
                        {log.trigger_type === 'cron' ? '자동 스케줄' : '수동 요청'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#2d3748', textAlign: 'center' }}>
                      {log.url_count}개
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: log.status === 'deferred' ? '#fffaf0' : log.status === 'success' ? '#e6fffa' : '#fff5f5',
                        color: log.status === 'deferred' ? '#744210' : log.status === 'success' ? '#234e52' : '#742a2a'
                      }}>
                        {log.status === 'deferred' ? '재시도 대기' : log.status === 'success' ? '성공' : '실패'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#718096', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.message}>
                      {log.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
