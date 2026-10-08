import { NextResponse } from 'next/server';
import { ASSET_NAMES, DEFAULT_UNIVERSE } from '@/lib/types';

export async function GET() {
  return NextResponse.json({
    items: DEFAULT_UNIVERSE.map((secid) => ({ secid, assetName: ASSET_NAMES[secid] ?? secid })),
  });
}
