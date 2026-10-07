'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type VisitorChartType from './VisitorChart';

const VisitorChartNoSSR = dynamic(() => import('./VisitorChart'), { ssr: false });

export default function VisitorChartClient(props: ComponentProps<typeof VisitorChartType>) {
  return <VisitorChartNoSSR {...props} />;
}
