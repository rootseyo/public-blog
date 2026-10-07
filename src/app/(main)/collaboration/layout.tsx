import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';

export const metadata: Metadata = {
  title: '협업과 프로젝트 문의 | Bright Notes 실무 실행 파트너',
  description: '제품, 기술, 조직 운영과 관련한 협업 및 프로젝트 문의를 남겨주세요. 목표를 구체적인 실행으로 연결할 수 있도록 함께 검토합니다.',
  alternates: {
    canonical: `${SITE_URL}/collaboration`,
  },
};

export default function CollaborationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
