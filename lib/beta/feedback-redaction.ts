const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:dob|date of birth)\s*[:\-]?\s*[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4}\b/gi, 'DOB: [redacted]'],
  [/\bmrn\s*[:\-]?\s*[a-z0-9\-]{3,}\b/gi, 'MRN: [redacted]'],
  [/\bssn\s*[:\-]?\s*[0-9\-]{4,}\b/gi, 'SSN: [redacted]'],
  [/\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g, '[redacted-ssn]'],
  [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[redacted-phone]'],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]'],
  [/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '[redacted-date]'],
  [/\b\d{4}-\d{2}-\d{2}\b/g, '[redacted-date]'],
  [/\b\d{5,}\b/g, '[redacted-number]'],
];

export function redactFeedbackText(value?: string, maxLength = 280) {
  if (!value?.trim()) {
    return undefined;
  }

  let redacted = value.trim().replace(/\s+/g, ' ');

  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  if (redacted.length > maxLength) {
    return `${redacted.slice(0, maxLength - 1).trimEnd()}…`;
  }

  return redacted;
}

export function detectFeedbackPhiRisk(value?: string) {
  if (!value?.trim()) {
    return false;
  }

  return /(dob|date of birth|mrn|ssn|address|street|avenue|road|drive|lane|patient name|full name|@[a-z0-9.-]+\.[a-z]{2,}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i.test(value);
}
