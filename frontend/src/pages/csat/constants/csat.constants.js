export const QUESTION_TYPES = {
  TEXT: 'text',
  RADIO: 'radio',
  SELECT: 'select',
  CHECKBOX: 'checkbox',
  RATING: 'rating',
};

export const QUESTION_TYPE_LABELS = {
  text: 'Text (Open-ended)',
  radio: 'Single Choice',
  select: 'Dropdown',
  checkbox: 'Multiple Choice',
  rating: 'Rating Scale',
};

export const DISPATCH_MODES = {
  INSTANT: 'instant',
  SCHEDULED: 'scheduled',
  RECURRING: 'recurring',
};

export const DISPATCH_MODE_LABELS = {
  instant: 'Send Now',
  scheduled: 'Schedule for Later',
  recurring: 'Recurring',
};

export const RECURRENCE_PATTERNS = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
};

export const RECURRENCE_LABELS = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

export const SURVEY_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

export const DISPATCH_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  CLOSED: 'closed',
};

export const RECIPIENT_STATUS = {
  SENT: 'sent',
  OPENED: 'opened',
  SUBMITTED: 'submitted',
};

// CSAT satisfaction threshold: answers >= ceil(maxValue × 0.6) count as satisfied
export const CSAT_THRESHOLD_RATIO = 0.6;
