import { NextResponse } from 'next/server';
import { isFeedbackEmailConfigured, sendFeedbackNotification } from '@/lib/beta/feedback-email';
import { listBetaFeedback, saveBetaFeedback, updateBetaFeedback } from '@/lib/db/client';
import { detectFeedbackPhiRisk, redactFeedbackText } from '@/lib/beta/feedback-redaction';
import { inferVeraGapType } from '@/lib/beta/vera-gaps';
import type {
  BetaFeedbackCategory,
  BetaFeedbackItem,
  BetaFeedbackLabel,
  BetaFeedbackMetadata,
  BetaFeedbackSeverity,
  BetaFeedbackStatus,
} from '@/types/beta-feedback';

const validCategories: BetaFeedbackCategory[] = ['workflow', 'navigation', 'feature-request', 'bug', 'general'];
const validLabels: BetaFeedbackLabel[] = [
  'helpful',
  'needs-work',
  'clinically-wrong',
  'missing-key-fact',
  'too-generic',
  'too-long',
  'invented-something',
  'unsafe-wording',
  'other',
];
const validStatuses: BetaFeedbackStatus[] = ['new', 'reviewed', 'needs_regression', 'converted', 'dismissed', 'planned', 'taught'];

function inferSeverity(label?: BetaFeedbackLabel): BetaFeedbackSeverity | undefined {
  switch (label) {
    case 'unsafe-wording':
    case 'clinically-wrong':
    case 'invented-something':
      return 'high';
    case 'missing-key-fact':
    case 'needs-work':
    case 'too-generic':
      return 'medium';
    case 'too-long':
    case 'other':
      return 'low';
    case 'helpful':
      return 'low';
    default:
      return undefined;
  }
}

function inferCategory(label?: BetaFeedbackLabel) {
  switch (label) {
    case 'unsafe-wording':
    case 'clinically-wrong':
    case 'invented-something':
      return 'bug';
    case 'needs-work':
    case 'missing-key-fact':
    case 'too-generic':
    case 'too-long':
      return 'workflow';
    default:
      return 'general';
  }
}

function buildDefaultMessage(body: Partial<BetaFeedbackItem>, label?: BetaFeedbackLabel) {
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }

  if (label === 'helpful') {
    return 'Provider marked this response as helpful.';
  }

  if (label) {
    return `Provider marked this response as ${label.replace(/-/g, ' ')}.`;
  }

  return 'Provider submitted beta feedback.';
}

export async function GET() {
  const feedback = await listBetaFeedback();
  return NextResponse.json({ feedback });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<BetaFeedbackItem>;
  const feedbackLabel = typeof body.feedbackLabel === 'string' && validLabels.includes(body.feedbackLabel as BetaFeedbackLabel)
    ? body.feedbackLabel as BetaFeedbackLabel
    : undefined;
  const category = typeof body.category === 'string' && validCategories.includes(body.category as BetaFeedbackCategory)
    ? body.category as BetaFeedbackCategory
    : inferCategory(feedbackLabel);

  const metadata = typeof body.metadata === 'object' && body.metadata
    ? body.metadata as BetaFeedbackMetadata
    : undefined;
  const promptSummary = redactFeedbackText(body.promptSummary || metadata?.promptSummary);
  const responseSummary = redactFeedbackText(body.responseSummary || metadata?.responseSummary);
  const userComment = redactFeedbackText(body.userComment || metadata?.userComment, 420);
  const desiredBehavior = redactFeedbackText(body.desiredBehavior || metadata?.desiredBehavior, 420);
  const pageContext = typeof body.pageContext === 'string' && body.pageContext.trim()
    ? body.pageContext.trim()
    : 'Beta feedback';
  const phiRiskFlag = Boolean(
    body.phiRiskFlag
    || metadata?.phiRiskFlag
    || detectFeedbackPhiRisk(body.promptSummary)
    || detectFeedbackPhiRisk(body.responseSummary)
    || detectFeedbackPhiRisk(body.userComment)
    || detectFeedbackPhiRisk(body.desiredBehavior),
  );

  const feedback = await saveBetaFeedback({
    pageContext,
    category,
    message: buildDefaultMessage(body, feedbackLabel),
    workflowArea: body.workflowArea || metadata?.workflowArea,
    noteType: body.noteType || metadata?.noteType,
    feedbackLabel,
    severity: body.severity || metadata?.severity || inferSeverity(feedbackLabel),
    answerMode: body.answerMode || metadata?.answerMode,
    builderFamily: body.builderFamily || metadata?.builderFamily,
    routeTaken: body.routeTaken || metadata?.routeTaken,
    model: body.model || metadata?.model,
    promptSummary,
    responseSummary,
    userComment,
    desiredBehavior,
    phiRiskFlag,
    convertedToRegression: false,
    metadata: metadata?.source === 'vera-gap'
      ? {
          ...metadata,
          gapType: metadata.gapType || inferVeraGapType(metadata.originalQuestion),
          promptSummary,
          responseSummary,
          userComment,
          desiredBehavior,
          phiRiskFlag,
        }
      : {
          ...metadata,
          workflowArea: body.workflowArea || metadata?.workflowArea,
          feedbackLabel,
          severity: body.severity || metadata?.severity || inferSeverity(feedbackLabel),
          answerMode: body.answerMode || metadata?.answerMode,
          builderFamily: body.builderFamily || metadata?.builderFamily,
          routeTaken: body.routeTaken || metadata?.routeTaken,
          model: body.model || metadata?.model,
          promptSummary,
          responseSummary,
          userComment,
          desiredBehavior,
          phiRiskFlag,
          noteType: body.noteType || metadata?.noteType,
        },
  });

  const notification = await sendFeedbackNotification(feedback);

  return NextResponse.json({
    feedback,
    notification,
    emailConfigured: isFeedbackEmailConfigured(),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    status?: BetaFeedbackStatus;
    adminNotes?: string;
    convertedToRegression?: boolean;
    regressionCaseId?: string;
  };

  if (typeof body.id !== 'string' || !body.id.trim()) {
    return NextResponse.json({ error: 'Feedback id is required.' }, { status: 400 });
  }

  const status = typeof body.status === 'string' && validStatuses.includes(body.status as BetaFeedbackStatus)
    ? body.status as BetaFeedbackStatus
    : null;
  const hasPatch = Boolean(status || typeof body.adminNotes === 'string' || typeof body.convertedToRegression === 'boolean' || typeof body.regressionCaseId === 'string');

  if (!hasPatch) {
    return NextResponse.json({ error: 'A valid feedback update is required.' }, { status: 400 });
  }

  const feedback = await updateBetaFeedback(body.id.trim(), {
    status: status || undefined,
    adminNotes: typeof body.adminNotes === 'string' ? redactFeedbackText(body.adminNotes, 600) : undefined,
    convertedToRegression: typeof body.convertedToRegression === 'boolean' ? body.convertedToRegression : undefined,
    regressionCaseId: typeof body.regressionCaseId === 'string' && body.regressionCaseId.trim()
      ? body.regressionCaseId.trim()
      : undefined,
  });

  if (!feedback) {
    return NextResponse.json({ error: 'Feedback item not found.' }, { status: 404 });
  }

  return NextResponse.json({ feedback });
}
