/**
 * FILE PURPOSE: Route handler to proxy cost reset to the API server
 *
 * WHY: The admin key must not be exposed to the client. This server-side handler
 *      reads ADMIN_API_KEY from env and forwards the request with the x-admin-key header.
 */

import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

export async function POST(): Promise<NextResponse> {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: 'ADMIN_API_KEY not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${API_URL}/api/costs/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Could not reach API server' }, { status: 502 });
  }
}
