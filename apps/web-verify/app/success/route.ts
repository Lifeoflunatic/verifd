import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  return NextResponse.redirect(new URL(code ? `/v/${code}` : '/', url));
}