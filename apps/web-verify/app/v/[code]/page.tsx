'use client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import VerifyView from '@/components/VerifyView';

export default function VerifyCodePage({ params }: { params: { code: string } }) {
  const { code } = params;
  // Use the new VerifyView component for MVP verify flow
  return <VerifyView code={code} />;
}