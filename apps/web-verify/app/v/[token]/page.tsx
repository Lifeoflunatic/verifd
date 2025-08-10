'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function TokenRedirect() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const token = params.token as string;
    if (token) {
      // Redirect to home page with token as query parameter
      router.push(`/?t=${encodeURIComponent(token)}`);
    } else {
      // No token, redirect to home
      router.push('/');
    }
  }, [params.token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to verification form...</p>
      </div>
    </div>
  );
}