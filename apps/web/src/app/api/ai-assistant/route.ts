import { NextResponse } from 'next/server';
import { queryBusinessAssistant } from '@/lib/ai/assistant';
import { readErpDatabase } from '@/lib/db/store';
import { resolveAuthenticatedSessionUser } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question } = body as {
      question: string;
    };

    const db = readErpDatabase();
    const actor = await resolveAuthenticatedSessionUser(request, db);
    if (!actor) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Valid authenticated session required.' },
        { status: 401 }
      );
    }

    const result = await queryBusinessAssistant({
      question,
      actor_role: actor.role,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'AI Assistant query failed' },
      { status: 403 }
    );
  }
}
