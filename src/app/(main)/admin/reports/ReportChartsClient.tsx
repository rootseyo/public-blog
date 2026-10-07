'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { HorizontalBarChart as HBC, BarChart as BC, TrendChart as TC } from './ReportCharts';
import type ReportExporterType from './ReportExporter';

export const HorizontalBarChart = dynamic(() => import('./ReportCharts').then(m => m.HorizontalBarChart), { ssr: false });
export const BarChart = dynamic(() => import('./ReportCharts').then(m => m.BarChart), { ssr: false });
export const TrendChart = dynamic(() => import('./ReportCharts').then(m => m.TrendChart), { ssr: false });
export const ReportExporter = dynamic(() => import('./ReportExporter'), { ssr: false });
