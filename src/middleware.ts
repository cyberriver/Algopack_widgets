import { NextResponse, type NextRequest } from 'next/server';

const extra = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function allowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (extra.includes('*') || extra.includes(origin)) return true;
  if (origin === 'http://localhost:3010' || origin === 'https://cyberriver.github.io') return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('.changesandbox.ru') || host.endsWith('.finam.ru');
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  const origin = request.headers.get('origin') ?? '';
  const allow = allowedOrigin(origin);
  const apply = (headers: Headers) => {
    if (!allow) return;
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    headers.set('Vary', 'Origin');
  };

  if (request.method === 'OPTIONS') {
    const headers = new Headers();
    apply(headers);
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  apply(response.headers);
  return response;
}

export const config = { matcher: '/api/:path*' };
