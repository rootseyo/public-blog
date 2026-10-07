'use client';
import React, { useRef, useState, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';

interface JourneyNode {
  name: string;
}

interface JourneyLink {
  source: string;
  target: string;
  value: number;
}

interface UserJourneyFlowProps {
  nodes: JourneyNode[];
  links: JourneyLink[];
}

export default function UserJourneyFlow({ nodes, links }: UserJourneyFlowProps) {
  const chartRef = useRef<ReactECharts>(null);
  const [zoomLevel, setZoomLevel] = useState(100);

  if (!nodes.length || !links.length) {
    return <p style={{ color: '#999', fontSize: '0.8rem', padding: '1rem' }}>데이터가 없습니다.</p>;
  }

  // Node depth extraction based on the bracket suffix if present, else default to 0.
  const getDepth = (name: string) => {
    const match = name.match(/\[(\d+)\]$/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const getCleanName = (name: string, full = false) => {
    const depth = getDepth(name);
    let cleanName = name.replace(/\s\[\d+\]$/, '');
    
    const maxLen = full ? 60 : 10;
    if (cleanName.length > maxLen) {
      cleanName = cleanName.substring(0, maxLen) + '...';
    }

    if (depth === 1) cleanName += ' ①';
    else if (depth === 2) cleanName += ' ②';
    else if (depth === 3) cleanName += ' ③';
    else if (depth > 3) cleanName += ` ④`;
    
    return cleanName;
  };

  const getDepthColor = (depth: number) => {
    if (depth === 0) return '#3b82f6'; // Blues - 유입 소스
    if (depth === 1) return '#10b981'; // Greens - 첫 페이지
    if (depth === 2) return '#f59e0b'; // Oranges - 두번째
    if (depth === 3) return '#ef4444'; // Red - 세번째
    return '#8b5cf6'; // Purples - 네번째 이상
  };

  const formattedNodes = nodes.map(node => {
    const depth = getDepth(node.name);
    return {
      name: node.name,
      value: getCleanName(node.name),
      itemStyle: {
        color: getDepthColor(depth),
        borderColor: '#fff',
        borderWidth: 1
      },
      label: {
        formatter: (params: any) => getCleanName(params.name)
      }
    };
  });

  // Compute max depth to determine chart width
  const maxDepth = Math.max(...nodes.map(n => getDepth(n.name)), 0);
  // Base width + extra per depth level beyond 2
  const chartWidthPct = Math.max(100, 100 + (maxDepth - 2) * 30);

  const option = {
    tooltip: {
      trigger: 'item' as const,
      triggerOn: 'mousemove' as const,
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          return `<b>${getCleanName(params.data.name, true)}</b>`;
        }
        return `${getCleanName(params.data.source, true)} → ${getCleanName(params.data.target, true)}: <b>${params.data.value}명</b>`;
      }
    },
    series: [
      {
        type: 'sankey',
        data: formattedNodes,
        links: links,
        emphasis: {
          focus: 'adjacency'
        },
        nodeAlign: 'left',
        nodeWidth: 20,
        nodeGap: 16,
        layoutIterations: 64,
        lineStyle: {
          color: 'source',
          curveness: 0.5,
          opacity: 0.3
        },
        label: {
          color: '#333',
          fontFamily: 'sans-serif',
          fontSize: 11,
          overflow: 'truncate',
          ellipsis: '...',
          width: 100
        }
      }
    ]
  };

  const handleZoom = useCallback((direction: 'in' | 'out' | 'reset') => {
    let newZoom = zoomLevel;
    if (direction === 'in') newZoom = Math.min(zoomLevel + 25, 300);
    else if (direction === 'out') newZoom = Math.max(zoomLevel - 25, 50);
    else newZoom = 100;
    setZoomLevel(newZoom);
  }, [zoomLevel]);

  return (
    <div style={{ position: 'relative' }}>
      {/* 줌 컨트롤 */}
      <div style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: 10,
        display: 'flex',
        gap: '4px',
        alignItems: 'center'
      }}>
        <button
          onClick={() => handleZoom('out')}
          style={{
            width: '32px', height: '32px',
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: '6px',
            background: 'var(--card-bg, #fff)',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '700',
            color: 'var(--foreground, #333)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          title="축소"
        >−</button>
        <span style={{
          fontSize: '0.7rem',
          fontWeight: '600',
          color: 'var(--text-dim, #999)',
          minWidth: '38px',
          textAlign: 'center'
        }}>{zoomLevel}%</span>
        <button
          onClick={() => handleZoom('in')}
          style={{
            width: '32px', height: '32px',
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: '6px',
            background: 'var(--card-bg, #fff)',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '700',
            color: 'var(--foreground, #333)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          title="확대"
        >+</button>
        <button
          onClick={() => handleZoom('reset')}
          style={{
            height: '32px',
            padding: '0 8px',
            border: '1px solid var(--border-color, #ddd)',
            borderRadius: '6px',
            background: 'var(--card-bg, #fff)',
            cursor: 'pointer',
            fontSize: '0.7rem',
            fontWeight: '600',
            color: 'var(--text-dim, #999)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          title="리셋"
        >Reset</button>
      </div>

      {/* 스크롤 가능한 차트 영역 */}
      <div style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingTop: '4px'
      }}>
        <div style={{
          width: `${chartWidthPct * zoomLevel / 100}%`,
          minWidth: '100%',
          transition: 'width 0.3s ease'
        }}>
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: `${Math.max(500, nodes.length * 18)}px`, width: '100%' }}
            opts={{ renderer: 'canvas' }}
          />
        </div>
      </div>
    </div>
  );
}
