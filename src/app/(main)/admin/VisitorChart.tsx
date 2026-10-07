'use client';

import ReactECharts from 'echarts-for-react';
import styles from './admin.module.css';

interface VisitorData {
  date: string;
  visitors: number | string;
}

export default function VisitorChart({ data }: { data: VisitorData[] }) {
  // 데이터가 최신순(DESC)일 수 있으므로 차트 표현을 위해 시간순(ASC)으로 정렬
  const chartData = [...data]
    .map(item => ({
      ...item,
      visitors: Number(item.visitors)
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderWidth: 1,
      borderColor: '#eee',
      textStyle: { color: '#333' },
      formatter: (params: any) => {
        const item = params[0];
        return `<div style="padding: 3px 6px;">
          <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${item.name}</div>
          <div style="font-weight: bold; color: #0070f3;">${item.value}명</div>
        </div>`;
      }
    },
    grid: {
      left: '10px',
      right: '20px',
      bottom: '10px',
      top: '30px',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chartData.map(item => {
        return new Date(item.date).toISOString().split('T')[0];
      }),
      axisLine: { lineStyle: { color: '#eee' } },
      axisLabel: { color: '#999', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
      axisLine: { show: false },
      axisLabel: { color: '#999', fontSize: 11 }
    },
    series: [
      {
        name: '방문자 수',
        type: 'bar',
        data: chartData.map(item => item.visitors),
        itemStyle: {
          color: '#0070f3',
          borderRadius: [4, 4, 0, 0]
        },
        label: {
          show: true,
          position: 'top',
          color: '#333',
          fontSize: 10,
          fontWeight: 'bold',
          formatter: (params: any) => {
            return params.value > 0 ? params.value : '';
          }
        }
      }
    ]
  };

  return (
    <div className={styles.chartWrapper}>
      <ReactECharts 
        option={option} 
        style={{ height: '400px', width: '100%' }}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
}
