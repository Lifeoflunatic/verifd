'use client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import SuccessView from '@/components/SuccessView';

export default function VerifyCodePage({ params }: { params: { code: string } }) {
  const { code } = params;
  // Render the same UI we previously rendered on /success using the ?code param
  return <SuccessView code={code} />;
}