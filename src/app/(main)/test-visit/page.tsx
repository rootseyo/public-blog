'use client';

import { useState, useEffect } from 'react';
import { logVisit } from '@/app/(main)/posts/actions';
import { getDeviceType } from '@/lib/utils';

const SAMPLE_UAS = [
  { 
    label: 'iPhone (Mobile)', 
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' 
  },
  { 
    label: 'Android (Mobile)', 
    ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36' 
  },
  { 
    label: 'iPad (Tablet)', 
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' 
  },
  { 
    label: 'Desktop (Chrome)', 
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
  }
];

export default function TestVisitPage() {
  const [result, setResult] = useState<string>('');
  const [testReferrer, setTestReferrer] = useState('https://linkedin.com/posts/test');
  const [testUA, setTestUA] = useState('');
  const [detectedType, setDetectedType] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTestUA(navigator.userAgent);
    }
  }, []);

  useEffect(() => {
    if (testUA) {
      // 클라이언트 측에서 미리 어떤 타입으로 나올지 확인 (동일한 로직 사용)
      setDetectedType(getDeviceType(testUA));
    }
  }, [testUA]);

  const handleTest = async () => {
    try {
      setResult('Logging...');
      // Simulate calling with custom Referrer and User-Agent
      await logVisit(undefined, '/test-visit-manually', testReferrer, testUA);
      setResult(`Success! Logged visit.\n- Referrer: ${testReferrer}\n- Device: ${detectedType}\n- UA: ${testUA.substring(0, 50)}...`);
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Device & Referrer Tracking Test</h1>
      <p>This page tests if User-Agents are correctly categorized into device types.</p>
      
      <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h3>1. Referrer Test</h3>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Referrer URL:</label>
        <input 
          type="text" 
          value={testReferrer} 
          onChange={(e) => setTestReferrer(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
        />
      </div>

      <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h3>2. Device Type Test (User-Agent)</h3>
        <p>Current Detected Type: <strong style={{ color: '#0070f3', fontSize: '1.2rem' }}>{detectedType}</strong></p>
        
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>User-Agent String:</label>
        <textarea 
          value={testUA} 
          onChange={(e) => setTestUA(e.target.value)}
          style={{ width: '100%', height: '80px', padding: '0.5rem', marginBottom: '1rem' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {SAMPLE_UAS.map((sample, i) => (
            <button 
              key={i} 
              onClick={() => setTestUA(sample.ua)}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              Set {sample.label}
            </button>
          ))}
        </div>
      </div>

      <button 
        onClick={handleTest}
        style={{ 
          width: '100%',
          padding: '1rem', 
          background: '#0070f3', 
          color: 'white', 
          border: 'none', 
          borderRadius: '8px',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        Trigger Log with Above Info
      </button>

      {result && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8f9fa', borderLeft: '4px solid #0070f3', whiteSpace: 'pre-wrap' }}>
          {result}
        </div>
      )}

      <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#666' }}>
        <p>💡 Tip: You can check the <strong>Admin Dashboard</strong> to see if these test visits appear correctly in the "Devices" and "Referrer" sections.</p>
      </div>
    </div>
  );
}
