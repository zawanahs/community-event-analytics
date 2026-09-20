import type {
  EventRecord,
  FeedbackRecord,
  PersonRecord,
  RawRow,
  RegistrationRecord,
  ResponseRecord,
  ValidationIssue,
} from '../types';
import type { NormalizedDataBundle, RawDataBundle } from './contract';
import { communityConfig, type DatasetKey } from '../config';

type IssueContext = { dataset: string; row: number; field: string };

const text = (value: unknown): string | null => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

function numberValue(value: unknown, context: IssueContext, issues: ValidationIssue[]): number | null {
  const normalized = text(value);
  if (normalized == null) return null;
  const parsed = Number(normalized.replace(/,/g, ''));
  if (!Number.isFinite(parsed)) {
    issues.push({ ...context, severity: 'error', code: 'invalid_number', message: `${context.dataset}.${context.field} must be numeric.` });
    return null;
  }
  return parsed;
}

function countValue(value: unknown, context: IssueContext, issues: ValidationIssue[]): number | null {
  const parsed = numberValue(value, context, issues);
  if (parsed == null) return null;
  if (!Number.isInteger(parsed) || parsed < 0) {
    issues.push({ ...context, severity: 'error', code: 'invalid_count', message: `${context.dataset}.${context.field} must be a non-negative integer.` });
    return null;
  }
  return parsed;
}

function ratingValue(
  value: unknown,
  context: IssueContext,
  issues: ValidationIssue[],
  bounds: { min: number; max: number },
): number | null {
  const parsed = numberValue(value, context, issues);
  if (parsed == null) return null;
  if (parsed < bounds.min || parsed > bounds.max) {
    issues.push({
      ...context,
      severity: 'error',
      code: 'rating_out_of_range',
      message: `${context.dataset}.${context.field} must be between ${bounds.min} and ${bounds.max}.`,
    });
    return null;
  }
  return parsed;
}

function booleanValue(value: unknown, context: IssueContext, issues: ValidationIssue[]): boolean | null {
  const normalized = text(value)?.toLowerCase();
  if (normalized == null) return null;
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  issues.push({ ...context, severity: 'error', code: 'invalid_boolean', message: `${context.dataset}.${context.field} must be a recognized boolean.` });
  return null;
}

const dateFormatter = (timeZone: string) => new Intl.DateTimeFormat('en-US', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const partsInZone = (date: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    dateFormatter(timeZone).formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
};

const validCalendarDate = (year: number, month: number, day: number) => {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
};

// Noon is used as the internal anchor for a calendar date. It avoids daylight-
// saving transitions around midnight while preserving inclusive date filtering.
const dateInZone = (year: number, month: number, day: number, timeZone: string): Date | null => {
  if (!validCalendarDate(year, month, day)) return null;
  const target = Date.UTC(year, month - 1, day, 12);
  let timestamp = target;
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const observed = partsInZone(new Date(timestamp), timeZone);
      const observedTimestamp = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
      const adjustment = target - observedTimestamp;
      timestamp += adjustment;
      if (adjustment === 0) break;
    }
    return new Date(timestamp);
  } catch {
    return null;
  }
};

export function parseDate(value: unknown, timeZone = communityConfig.data.reportingTimezone): Date | null {
  const normalized = text(value);
  if (!normalized) return null;
  let match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return dateInZone(+match[1], +match[2], +match[3], timeZone);
  match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return dateInZone(+match[3], +match[1], +match[2], timeZone);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) return null;
  const instant = new Date(normalized);
  if (Number.isNaN(instant.getTime())) return null;
  try {
    const local = partsInZone(instant, timeZone);
    return dateInZone(local.year, local.month, local.day, timeZone);
  } catch {
    return null;
  }
}

const isoDate = (date: Date | null, timeZone: string): string | null => {
  if (!date) return null;
  try {
    const { year, month, day } = partsInZone(date, timeZone);
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  } catch {
    return null;
  }
};

const sourceValue = (row: RawRow, dataset: DatasetKey, canonicalField: string): unknown => {
  for (const field of [canonicalField, ...(communityConfig.data.fieldAliases[dataset][canonicalField] ?? [])]) {
    const value = row[field];
    if (value == null || (typeof value === 'string' && !value.trim())) continue;
    return value;
  }
  return null;
};

function requiredText(value: unknown, field: string, dataset: string, index: number, issues: ValidationIssue[]): string {
  const normalized = text(value);
  if (!normalized) {
    issues.push({ severity: 'error', code: 'missing_required_field', dataset, row: index + 2, field, message: `${dataset}.${field} is required on source row ${index + 2}.` });
  }
  return normalized ?? '';
}

const questionRole = (value: unknown): string => {
  const normalized = text(value) ?? '';
  return communityConfig.feedbackRoles.find((role) => (role.sourceValues as readonly string[]).includes(normalized))?.id ?? normalized;
};

export function normalizeSource(bundle: RawDataBundle): NormalizedDataBundle {
  const issues: ValidationIssue[] = [];
  const { datasets } = bundle;
  const reportingTimezone = bundle.source.reportingTimezone;

  const events = datasets.events.map((row, index) => {
    const eventDate = requiredText(sourceValue(row, 'events', 'event_date'), 'event_date', 'events', index, issues);
    const date = parseDate(eventDate, reportingTimezone);
    if (eventDate && !date) {
      issues.push({ severity: 'error', code: 'invalid_date', dataset: 'events', row: index + 2, field: 'event_date', message: `events.event_date is invalid on source row ${index + 2}.` });
    }
    const registered = countValue(sourceValue(row, 'events', 'registered'), { dataset: 'events', row: index + 2, field: 'registered' }, issues);
    const medianRegistered = numberValue(sourceValue(row, 'events', 'year_median_registered'), { dataset: 'events', row: index + 2, field: 'year_median_registered' }, issues);
    const suppliedDemand = numberValue(sourceValue(row, 'events', 'demand_index'), { dataset: 'events', row: index + 2, field: 'demand_index' }, issues);
    return {
      ...row,
      event_id: requiredText(sourceValue(row, 'events', 'event_id'), 'event_id', 'events', index, issues),
      event_name: requiredText(sourceValue(row, 'events', 'event_name'), 'event_name', 'events', index, issues),
      event_date: isoDate(date, reportingTimezone) ?? eventDate,
      date,
      format: text(sourceValue(row, 'events', 'format')),
      topic_primary: text(sourceValue(row, 'events', 'topic_primary')),
      registered,
      attended: countValue(sourceValue(row, 'events', 'attended'), { dataset: 'events', row: index + 2, field: 'attended' }, issues),
      capacity: countValue(sourceValue(row, 'events', 'capacity'), { dataset: 'events', row: index + 2, field: 'capacity' }, issues),
      feedback_responses: countValue(sourceValue(row, 'events', 'feedback_responses'), { dataset: 'events', row: index + 2, field: 'feedback_responses' }, issues),
      year_median_registered: medianRegistered,
      demand_index: suppliedDemand ?? (registered != null && medianRegistered != null && medianRegistered > 0 ? registered / medianRegistered : null),
    } as EventRecord;
  });

  const surveyResponses = datasets.surveyResponses.map((row, index) => ({
    ...row,
    response_id: requiredText(sourceValue(row, 'surveyResponses', 'response_id'), 'response_id', 'surveyResponses', index, issues),
    event_id: requiredText(sourceValue(row, 'surveyResponses', 'event_id'), 'event_id', 'surveyResponses', index, issues),
    satisfaction: ratingValue(sourceValue(row, 'surveyResponses', 'satisfaction'), { dataset: 'surveyResponses', row: index + 2, field: 'satisfaction' }, issues, communityConfig.ratings.satisfaction),
    recommend: ratingValue(sourceValue(row, 'surveyResponses', 'recommend'), { dataset: 'surveyResponses', row: index + 2, field: 'recommend' }, issues, communityConfig.ratings.recommendation),
    experience_segment: text(sourceValue(row, 'surveyResponses', 'experience_segment')),
  })) as ResponseRecord[];

  const feedbackAnswers = datasets.feedbackAnswers.map((row, index) => ({
    ...row,
    response_id: requiredText(sourceValue(row, 'feedbackAnswers', 'response_id'), 'response_id', 'feedbackAnswers', index, issues),
    event_id: requiredText(sourceValue(row, 'feedbackAnswers', 'event_id'), 'event_id', 'feedbackAnswers', index, issues),
    question_role: questionRole(sourceValue(row, 'feedbackAnswers', 'question_role')),
    text: requiredText(sourceValue(row, 'feedbackAnswers', 'text'), 'text', 'feedbackAnswers', index, issues),
  })) as FeedbackRecord[];

  const participants = datasets.participants.map((row, index) => ({
    ...row,
    participant_id: requiredText(sourceValue(row, 'participants', 'participant_id'), 'participant_id', 'participants', index, issues),
    events_registered: countValue(sourceValue(row, 'participants', 'events_registered'), { dataset: 'participants', row: index + 2, field: 'events_registered' }, issues),
    events_attended: countValue(sourceValue(row, 'participants', 'events_attended'), { dataset: 'participants', row: index + 2, field: 'events_attended' }, issues),
    is_returning_attended: booleanValue(sourceValue(row, 'participants', 'is_returning_attended'), { dataset: 'participants', row: index + 2, field: 'is_returning_attended' }, issues),
    is_returning_registered: booleanValue(sourceValue(row, 'participants', 'is_returning_registered'), { dataset: 'participants', row: index + 2, field: 'is_returning_registered' }, issues),
  })) as PersonRecord[];
  const participantsById = new Map(participants.map((person) => [person.participant_id, person]));

  const registrations = datasets.registrations.map((row, index) => {
    const participantId = requiredText(sourceValue(row, 'registrations', 'participant_id'), 'participant_id', 'registrations', index, issues);
    const attended = booleanValue(sourceValue(row, 'registrations', 'attended'), { dataset: 'registrations', row: index + 2, field: 'attended' }, issues);
    const attendanceKnown = booleanValue(sourceValue(row, 'registrations', 'attendance_known'), { dataset: 'registrations', row: index + 2, field: 'attendance_known' }, issues);
    return {
      ...row,
      participant_id: participantId,
      event_id: requiredText(sourceValue(row, 'registrations', 'event_id'), 'event_id', 'registrations', index, issues),
      gender_segment: text(sourceValue(row, 'registrations', 'gender_segment')),
      sector_segment: text(sourceValue(row, 'registrations', 'sector_segment')),
      job_family_segment: text(sourceValue(row, 'registrations', 'job_family_segment')),
      experience_segment: text(sourceValue(row, 'registrations', 'experience_segment')),
      organization_segment: text(sourceValue(row, 'registrations', 'organization_segment')),
      attended,
      attendance_known: attendanceKnown ?? (attended == null ? null : true),
      person: participantsById.get(participantId) ?? null,
    } as RegistrationRecord;
  });

  return { datasets: { events, surveyResponses, feedbackAnswers, registrations, participants }, source: bundle.source, issues };
}
