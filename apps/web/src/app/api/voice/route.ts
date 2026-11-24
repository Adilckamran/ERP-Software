import { NextResponse } from 'next/server';
import { interpretVoiceCommand } from '@/lib/ai/voice-parser';
import { readErpDatabase } from '@/lib/db/store';
import { resolveAuthenticatedSessionUser } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transcript } = body as {
      transcript: string;
    };

    const db = readErpDatabase();
    const actor = await resolveAuthenticatedSessionUser(request, db);
    if (!actor) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Valid authenticated session required.' },
        { status: 401 }
      );
    }

    if (actor.role !== 'OWNER' && actor.role !== 'PRODUCTION_MANAGER') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Forbidden: Only Admin / Owner and authorized Production Managers can use the Voice Transaction Assistant.',
        },
        { status: 403 }
      );
    }

    if (!transcript || !transcript.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Voice transcript cannot be empty.' },
        { status: 400 }
      );
    }

    const parsed = await interpretVoiceCommand(transcript);

    // Enforce strict role permissions for Production Manager
    if (actor.role === 'PRODUCTION_MANAGER') {
      const isPurchaseIntent =
        parsed.intent === 'RAW_MATERIAL_PURCHASE' ||
        parsed.intent === 'RAW_MATERIAL_STOCK_RECEIPT';
      const isProductionOrMachineIntent =
        parsed.intent === 'PRODUCTION_BATCH_REPORT' ||
        parsed.intent === 'MACHINE_ISSUE_REPORT' ||
        parsed.intent === 'AMBIGUOUS_OR_INCOMPLETE';

      if (isPurchaseIntent && !actor.can_record_purchases) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Forbidden: Production Manager is not authorized to record supplier purchases or incoming stock receipts unless explicitly granted permission by Admin.',
          },
          { status: 403 }
        );
      }

      if (!isProductionOrMachineIntent && !isPurchaseIntent) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Forbidden: Production Manager can only use Voice Assistant for production reporting and machine issue reporting.',
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      parsed,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Voice parsing failed' },
      { status: 400 }
    );
  }
}
