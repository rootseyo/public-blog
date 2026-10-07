'use client';

import ReactECharts from 'echarts-for-react';
import styles from '../admin.module.css';

interface ChartProps {
  data: any[];
  title?: string;
  height?: number;
}

export function HorizontalBarChart({ data, title }: ChartProps) {
  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '10px',
      right: '30px',
      bottom: '10px',
      top: title ? '40px' : '10px',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      boundaryGap: [0, 0.01]
    },
    yAxis: {
      type: 'category',
      data: data.map(item => item.label).reverse(),
      axisLabel: {
        width: 150,
        overflow: 'truncate',
        interval: 0
      }
    },
    series: [
      {
        type: 'bar',
        data: data.map(item => item.value).reverse(),
        itemStyle: {
          color: '#0070f3'
        },
        label: {
          show: true,
          position: 'right'
        }
      }
    ]
  };

  return (
    <div className={styles.chartWrapper}>
      <ReactECharts option={option} style={{ height: '500px', width: '100%' }} />
    </div>
  );
}

export function DoughnutChart({ data, title }: ChartProps) {
  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'horizontal',
      bottom: '0',
      type: 'scroll'
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}: {d}%',
          fontSize: 10
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold'
          }
        },
        data: data
      }
    ]
  };

  return (
    <div className={styles.chartWrapper}>
      <ReactECharts option={option} style={{ height: '400px', width: '100%' }} />
    </div>
  );
}

export function PieChart({ data, title }: ChartProps) {
  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'horizontal',
      bottom: '0',
      type: 'scroll'
    },
    series: [
      {
        type: 'pie',
        radius: '70%',
        center: ['50%', '50%'],
        data: data,
        itemStyle: {
          borderRadius: 8
        },
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}: {d}%',
          fontSize: 10
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  };

  return (
    <div className={styles.chartWrapper}>
      <ReactECharts option={option} style={{ height: '400px', width: '100%' }} />
    </div>
  );
}

export function TrendChart({ data, title }: { data: any[], title?: string }) {
  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['방문자 수', '글 발행 수'],
      bottom: 0
    },
    grid: {
      left: '10px',
      right: '10px',
      bottom: '40px',
      top: title ? '60px' : '40px', // Increased top padding from 40px/20px to 60px/40px
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.date),
      axisLabel: {
        rotate: 45,
        interval: Math.ceil(data.length / 15)
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '방문자',
        position: 'left',
        axisLine: { show: true, lineStyle: { color: '#4f46e5' } }, // Indigo
        splitLine: { show: false }
      },
      {
        type: 'value',
        name: '발행수',
        position: 'right',
        axisLine: { show: true, lineStyle: { color: '#f59e0b' } }, // Amber
        splitLine: { show: true, lineStyle: { type: 'dashed' } }
      }
    ],
    series: [
      {
        name: '글 발행 수',
        type: 'line',
        yAxisIndex: 1,
        data: data.map(item => item.posts),
        smooth: false,
        z: 1, // Move to background
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 2, color: '#f59e0b' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.5)' }, // Amber with transparency
              { offset: 1, color: 'rgba(245, 158, 11, 0.1)' }
            ]
          }
        },
        symbol: 'circle',
        symbolSize: 6,
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          fontWeight: 'bold',
          color: '#d97706',
          formatter: (params: any) => params.value > 0 ? params.value : ''
        }
      },
      {
        name: '방문자 수',
        type: 'bar',
        data: data.map(item => item.visitors),
        z: 2, // Move to foreground
        itemStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(79, 70, 229, 0.9)' }, // Indigo
              { offset: 1, color: 'rgba(79, 70, 229, 0.4)' }
            ]
          },
          borderRadius: [2, 2, 0, 0]
        },
        label: {
          show: true,
          position: 'top',
          fontSize: 9,
          color: '#4f46e5',
          formatter: (params: any) => params.value > 0 ? params.value : ''
        }
      }
    ]
  };

  return (
    <div className={styles.chartWrapper}>
      <ReactECharts option={option} style={{ height: '500px', width: '100%' }} />
    </div>
  );
}

export function BarChart({ data, title, height }: ChartProps) {
  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '10px',
      right: '40px',
      bottom: '10px',
      top: title ? '30px' : '10px',
      containLabel: true
    },
    xAxis: {
      type: 'value'
    },
    yAxis: {
      type: 'category',
      data: data.map(item => item.date || item.label || item.name).reverse(),
      axisLabel: {
        interval: 0,
        width: 120,
        overflow: 'truncate',
        fontSize: 10
      }
    },
    series: [
      {
        data: data.map(item => item.value).reverse(),
        type: 'bar',
        itemStyle: {
          color: '#0070f3',
          borderRadius: [0, 4, 4, 0]
        },
        label: {
          show: true,
          position: 'right',
          color: 'var(--foreground)',
          fontSize: 9
        }
      }
    ]
  };

  const chartHeight = height || Math.max(100, data.length * 35); // Even tighter minimum for small data sets

  return (
    <div className={styles.chartWrapper}>
      <ReactECharts option={option} style={{ height: `${chartHeight}px`, width: '100%' }} />
    </div>
  );
}
