import { DataContractError } from './contract';
import type { NormalizedDataBundle } from './contract';
import type { ValidationIssue } from '../types';

function duplicateIssues(values: string[], dataset: string, field: string): ValidationIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.filter(Boolean).forEach((value) => (seen.has(value) ? duplicates.add(value) : seen.add(value)));
  return [...duplicates].map((value) => ({ severity: 'error', code: 'duplicate_key', dataset, field, message: `${dataset}.${field} must be unique; duplicate value ${JSON.stringify(value)} was found.` }));
}

export function validateSource(bundle: NormalizedDataBundle): NormalizedDataBundle {
  const { datasets } = bundle;
  const issues = [...bundle.issues];

  if (!datasets.events.length) issues.push({ severity: 'error', code: 'empty_core_dataset', dataset: 'events', message: 'The events dataset must contain at least one valid row.' });
  issues.push(...duplicateIssues(datasets.events.map((row) => row.event_id), 'events', 'event_id'));
  issues.push(...duplicateIssues(datasets.surveyResponses.map((row) => row.response_id), 'surveyResponses', 'response_id'));
  issues.push(...duplicateIssues(datasets.participants.map((row) => row.participant_id), 'participants', 'participant_id'));
  issues.push(...duplicateIssues(datasets.registrations.map((row) => `${row.participant_id}\u0000${row.event_id}`), 'registrations', '(participant_id,event_id)'));

  const eventIds = new Set(datasets.events.map((row) => row.event_id));
  const responsesById = new Map(datasets.surveyResponses.map((row) => [row.response_id, row]));
  const participantIds = new Set(datasets.participants.map((row) => row.participant_id));
  const requireEvent = (dataset: string, eventId: string) => {
    if (!eventIds.has(eventId)) issues.push({ severity: 'error', code: 'orphan_event', dataset, field: 'event_id', message: `${dataset} references unknown event_id ${JSON.stringify(eventId)}.` });
  };

  datasets.surveyResponses.forEach((row) => requireEvent('surveyResponses', row.event_id));
  datasets.registrations.forEach((row) => requireEvent('registrations', row.event_id));
  datasets.feedbackAnswers.forEach((row) => {
    requireEvent('feedbackAnswers', row.event_id);
    const response = responsesById.get(row.response_id);
    if (!response) issues.push({ severity: 'error', code: 'orphan_response', dataset: 'feedbackAnswers', field: 'response_id', message: `feedbackAnswers references unknown response_id ${JSON.stringify(row.response_id)}.` });
    else if (response.event_id !== row.event_id) issues.push({ severity: 'error', code: 'response_event_mismatch', dataset: 'feedbackAnswers', field: 'event_id', message: `feedbackAnswers response ${JSON.stringify(row.response_id)} does not match its parent event.` });
  });

  if (datasets.participants.length) {
    const missing = new Set(datasets.registrations.filter((row) => !participantIds.has(row.participant_id)).map((row) => row.participant_id));
    if (missing.size) issues.push({ severity: 'warning', code: 'missing_participant_summary', dataset: 'registrations', field: 'participant_id', message: `${missing.size} participant IDs have registrations but no participant summary; lifetime returner metrics exclude them.` });
  }

  for (const person of datasets.participants) {
    if (person.events_registered != null && person.is_returning_registered != null && person.is_returning_registered !== (person.events_registered >= 2)) {
      issues.push({ severity: 'error', code: 'returning_status_mismatch', dataset: 'participants', field: 'is_returning_registered', message: `Participant ${JSON.stringify(person.participant_id)} has an inconsistent registered-returning status.` });
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length) throw new DataContractError(`Data contract validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}.`, issues);
  return { ...bundle, issues };
}
