'use client';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type UserJourneyFlowType from './UserJourneyFlow';

const UserJourneyFlowNoSSR = dynamic(() => import('./UserJourneyFlow'), { ssr: false });

export default function UserJourneyFlowClient(props: ComponentProps<typeof UserJourneyFlowType>) {
  return <UserJourneyFlowNoSSR {...props} />;
}
