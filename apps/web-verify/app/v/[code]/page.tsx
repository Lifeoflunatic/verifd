export const dynamic = 'force-dynamic';
import VerifyView from '@/components/VerifyView';

export default function Page({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { phone?: string };
}) {
  const phone =
    typeof searchParams?.phone === 'string' && searchParams.phone.length > 0
      ? searchParams.phone
      : undefined;
  return <VerifyView code={params.code} initialPhone={phone} />;
}