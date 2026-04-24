import { NextResponse } from 'next/server';
import { isFeedbackEmailConfigured, sendFeedbackNotification } from '@/lib/beta/feedback-email';
import { listBetaFeedback, saveBetaFeedback, updateBetaFeedbackStatus } from '@/lib/db/client';
import { inferVeraGapType } from '@/lib/beta/vera-gaps';
import type { BetaFeedbackCategory, BetaFeedbackItem, BetaFeedbackMetadata, BetaFeedbackStatus } from '@/types/beta-feedback';

const validCategories: BetaFeedbackCategory[] = ['workflow', 'navigation', 'feature-request', 'bug', 'general'];

export async function GET() {
  const feedback = await listBetaFeedback();
  return NextResponse.json({ feedback });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<BetaFeedbackItem>;

  if (typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: 'Feedback message is required.' }, { status: 400 });
  }

  if (typeof body.pageContext !== 'string' || !body.pageContext.trim()) {
    return NextResponse.json({ error: 'Page context is required.' }, { status: 400 });
  }

  const category = typeof body.category === 'string' && validCategories.includes(body.category as BetaFeedbackCategory)
    ? body.category as BetaFeedbackCategory
    : 'general';

  const metadata = typeof body.metadata === 'object' && body.metadata
    ? body.metadata as BetaFeedbackMetadata
    : undefined;

  const feedback = await saveBetaFeedback({
    pageContext: body.pageContext.trim(),
    category,
    message: body.message.trim(),
    metadata: metadata?.source === 'vera-gap'
      ? {
          ...metadata,
          gapType: metadata.gapType || inferVeraGapType(metadata.originalQuestion),
        }
      : metadata,
  });

  const notification = await sendFeedbackNotification(feedback);

  return NextResponse.json({
    feedback,
    notification,
    emailConfigured: isFeedbackEmailConfigured(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; status?: BetaFeedbackStatus };

  if (typeof body.id !== 'string' || !body.id.trim()) {
    return NextResponse.json({ error: 'Feedback id is required.' }, { status: 400 });
  }

  const validStatuses: BetaFeedbackStatus[] = ['new', 'planned', 'taught'];
  const status = typeof body.status === 'string' && validStatuses.includes(body.status as BetaFeedbackStatus)
    ? body.status as BetaFeedbackStatus
    : null;

  if (!status) {
    return NextResponse.json({ error: 'Valid feedback status is required.' }, { status: 400 });
  }

  const feedback = await updateBetaFeedbackStatus(body.id.trim(), status);

  if (!feedback) {
    return NextResponse.json({ error: 'Feedback item not found.' }, { status: 404 });
  }

  return NextResponse.json({ feedback });
}
