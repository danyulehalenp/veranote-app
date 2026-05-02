import nodemailer from '@veranote/nodemailer';
import type { BetaFeedbackItem } from '@/types/beta-feedback';

export type FeedbackNotificationResult = {
  configured: boolean;
  delivered: boolean;
  recipient?: string;
  error?: string;
};

function getSmtpConfig() {
  const host = process.env.FEEDBACK_SMTP_HOST?.trim();
  const user = process.env.FEEDBACK_SMTP_USER?.trim();
  const pass = process.env.FEEDBACK_SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  const port = Number(process.env.FEEDBACK_SMTP_PORT || '587');
  const secure = process.env.FEEDBACK_SMTP_SECURE === 'true' || port === 465;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: buildFromAddress(
      process.env.FEEDBACK_NOTIFICATION_FROM?.trim(),
      process.env.FEEDBACK_NOTIFICATION_FROM_NAME?.trim() || 'Veranote Feedback Bot',
      user,
    ),
    to: process.env.FEEDBACK_NOTIFICATION_TO?.trim() || 'daniel@veranote.org',
  };
}

export function isFeedbackEmailConfigured() {
  return Boolean(getSmtpConfig());
}

export async function sendFeedbackNotification(feedback: BetaFeedbackItem): Promise<FeedbackNotificationResult> {
  const config = getSmtpConfig();
  if (!config) {
    return {
      configured: false,
      delivered: false,
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject: buildFeedbackNotificationSubject(feedback),
      text: buildPlainTextBody(feedback),
    });

    return {
      configured: true,
      delivered: true,
      recipient: config.to,
    };
  } catch (error) {
    return {
      configured: true,
      delivered: false,
      recipient: config.to,
      error: error instanceof Error ? error.message : 'Unknown email delivery error.',
    };
  }
}

export function buildFeedbackNotificationSubject(feedback: BetaFeedbackItem) {
  if (feedback.metadata?.source === 'vera-gap') {
    const gapType = feedback.metadata.gapType ? feedback.metadata.gapType.replace(/-/g, ' ') : 'knowledge';
    const question = feedback.metadata.originalQuestion?.trim() || feedback.message.trim();
    return `[Veranote][Teach Atlas][${gapType}] ${truncateForSubject(question)}`;
  }

  return `[Veranote][Beta Feedback][${feedback.category}] ${truncateForSubject(feedback.message.trim())}`;
}

function buildPlainTextBody(feedback: BetaFeedbackItem) {
  return [
    `Category: ${feedback.category}`,
    `Status: ${feedback.status}`,
    `Created: ${feedback.createdAt}`,
    `Page context: ${feedback.pageContext}`,
    feedback.metadata?.source ? `Source: ${feedback.metadata.source}` : null,
    feedback.metadata?.gapType ? `Gap type: ${feedback.metadata.gapType}` : null,
    feedback.metadata?.providerAddressingName ? `Provider: ${feedback.metadata.providerAddressingName}` : null,
    feedback.metadata?.noteType ? `Note type: ${feedback.metadata.noteType}` : null,
    feedback.metadata?.stage ? `Stage: ${feedback.metadata.stage}` : null,
    '',
    'Feedback message:',
    feedback.message,
    feedback.metadata?.originalQuestion ? ['', 'Original provider question:', feedback.metadata.originalQuestion] : null,
    feedback.metadata?.assistantReply ? ['', 'Assistant reply:', feedback.metadata.assistantReply] : null,
  ].flat().filter(Boolean).join('\n');
}

function truncateForSubject(value: string, maxLength = 72) {
  if (!value) {
    return 'New feedback item';
  }

  return value.length > maxLength
    ? `${value.slice(0, maxLength - 1).trimEnd()}…`
    : value;
}

export function buildFromAddress(explicitFrom: string | undefined, fromName: string, fallbackEmail: string) {
  if (explicitFrom) {
    return explicitFrom;
  }

  const normalizedName = fromName.replace(/"/g, '').trim();
  return normalizedName ? `"${normalizedName}" <${fallbackEmail}>` : fallbackEmail;
}
