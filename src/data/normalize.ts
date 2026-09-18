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

function booleanValue(value: unknown, context: IssueContext, issues: ValidationIssue[]): boolean | null {
  const normalized = text(value)?.toLowerCase();
  if (normalized == null) return null;
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  issues.push({ ...context, severity: 'error', code: 'invalid_boolean', message: `${context.dataset}.${context.field} must be a recognized boolean.` });
  return null;
}

export function parseDate(value: unknown): Date | null {
  const normalized = text(value);
  if (!normalized) return null;
  let match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return new Date(Date.UTC(+match[3], +match[1] - 1, +match[2]));
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const isoDate = (date: Date | null): string | null => date?.toISOString().slice(0, 10) ?? null;

const sourceValue = (row: RawRow, dataset: DatasetKey, canonicalField: string): unknown => {
  for (const field of [canonicalField, ...(communityConfig.data.fieldAliases[dataset][canonicalField] ?? [])]) {
    if (row[field] != null && row[field] !== '') return row[field];
  }
  return null;
};

function requiredText(row: RawRow, field: string, dataset: string, index: number, issues: ValidationIssue[]): string {
  const value = text(row[field]);
  if (!value) {
    issues.push({ severity: 'error', code: 'missing_required_field', dataset, row: index + 2, field, message: `${dataset}.${field} is required on source row ${index + 2}.` });
  }
  return value ?? '';
}

const questionRole = (value: unknown): string => {
  const normalized = text(value) ?? '';
  return communityConfig.feedbackRoles.find((role) => (role.sourceValues as readonly string[]).includes(normalized))?.id ?? normalized;
};

export function normalizeSource(bundle: RawDataBundle): NormalizedDataBundle {
  const issues: ValidationIssue[] = [];
  const { datasets } = bundle;

  const events = datasets.events.map((row, index) => {
    const eventDate = requiredText(row, 'event_date', 'events', index, issues);
    const date = parseDate(eventDate);
    if (eventDate && !date) {
      issues.push({ severity: 'error', code: 'invalid_date', dataset: 'events', row: index + 2, field: 'event_date', message: `events.event_date is invalid on source row ${index + 2}.` });
    }
    const registered = countValue(row.registered, { dataset: 'events', row: index + 2, field: 'registered' }, issues);
    const medianRegistered = numberValue(row.year_median_registered, { dataset: 'events', row: index + 2, field: 'year_median_registered' }, issues);
    const suppliedDemand = numberValue(row.demand_index, { dataset: 'events', row: index + 2, field: 'demand_index' }, issues);
    return {
      ...row,
      event_id: requiredText(row, 'event_id', 'events', index, issues),
      event_name: requiredText(row, 'event_name', 'events', index, issues),
      event_date: isoDate(date) ?? eventDate,
      date,
      format: text(row.format),
      topic_primary: text(row.topic_primary),
      registered,
      attended: countValue(row.attended, { dataset: 'events', row: index + 2, field: 'attended' }, issues),
      capacity: countValue(row.capacity, { dataset: 'events', row: index + 2, field: 'capacity' }, issues),
      feedback_responses: countValue(row.feedback_responses, { dataset: 'events', row: index + 2, field: 'feedback_responses' }, issues),
      year_median_registered: medianRegistered,
      demand_index: suppliedDemand ?? (registered != null && medianRegistered != null && medianRegistered > 0 ? registered / medianRegistered : null),
    } as EventRecord;
  });

  const surveyResponses = datasets.surveyResponses.map((row, index) => ({
    ...row,
    response_id: requiredText(row, 'response_id', 'surveyResponses', index, issues),
    event_id: requiredText(row, 'event_id', 'surveyResponses', index, issues),
    satisfaction: numberValue(sourceValue(row, 'surveyResponses', 'satisfaction'), { dataset: 'surveyResponses', row: index + 2, field: 'satisfaction' }, issues),
    recommend: numberValue(sourceValue(row, 'surveyResponses', 'recommend'), { dataset: 'surveyResponses', row: index + 2, field: 'recommend' }, issues),
    experience_segment: text(sourceValue(row, 'surveyResponses', 'experience_segment')),
  })) as ResponseRecord[];

  const feedbackAnswers = datasets.feedbackAnswers.map((row, index) => ({
    ...row,
    response_id: requiredText(row, 'response_id', 'feedbackAnswers', index, issues),
    event_id: requiredText(row, 'event_id', 'feedbackAnswers', index, issues),
    question_role: questionRole(sourceValue(row, 'feedbackAnswers', 'question_role')),
    text: requiredText(row, 'text', 'feedbackAnswers', index, issues),
  })) as FeedbackRecord[];

  const participants = datasets.participants.map((row, index) => ({
    ...row,
    participant_id: requiredText({ participant_id: sourceValue(row, 'participants', 'participant_id') }, 'participant_id', 'participants', index, issues),
    events_registered: countValue(row.events_registered, { dataset: 'participants', row: index + 2, field: 'events_registered' }, issues),
    events_attended: countValue(row.events_attended, { dataset: 'participants', row: index + 2, field: 'events_attended' }, issues),
    is_returning_attended: booleanValue(sourceValue(row, 'participants', 'is_returning_attended'), { dataset: 'participants', row: index + 2, field: 'is_returning_attended' }, issues),
    is_returning_registered: booleanValue(row.is_returning_registered, { dataset: 'participants', row: index + 2, field: 'is_returning_registered' }, issues),
  })) as PersonRecord[];
  const participantsById = new Map(participants.map((person) => [person.participant_id, person]));

  const registrations = datasets.registrations.map((row, index) => {
    const participantId = requiredText({ participant_id: sourceValue(row, 'registrations', 'participant_id') }, 'participant_id', 'registrations', index, issues);
    const attended = booleanValue(row.attended, { dataset: 'registrations', row: index + 2, field: 'attended' }, issues);
    const attendanceKnown = booleanValue(row.attendance_known, { dataset: 'registrations', row: index + 2, field: 'attendance_known' }, issues);
    return {
      ...row,
      participant_id: participantId,
      event_id: requiredText(row, 'event_id', 'registrations', index, issues),
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
