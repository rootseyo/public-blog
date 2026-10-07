import { NextResponse } from 'next/server';
import { runScheduledIndexingIfDue } from '@/lib/cron-scheduler';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runScheduledIndexingIfDue();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[Cron Indexing API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
