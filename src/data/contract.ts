import type {
  EventRecord,
  FeedbackRecord,
  PersonRecord,
  RawRow,
  RegistrationRecord,
  ResponseRecord,
  SourceMetadata,
  ValidationIssue,
} from '../types';

export interface RawDatasets {
  events: RawRow[];
  surveyResponses: RawRow[];
  feedbackAnswers: RawRow[];
  registrations: RawRow[];
  participants: RawRow[];
}

export interface RawDataBundle {
  datasets: RawDatasets;
  source: SourceMetadata;
}

export interface NormalizedDatasets {
  events: EventRecord[];
  surveyResponses: ResponseRecord[];
  feedbackAnswers: FeedbackRecord[];
  registrations: RegistrationRecord[];
  participants: PersonRecord[];
}

export interface NormalizedDataBundle {
  datasets: NormalizedDatasets;
  source: SourceMetadata;
  issues: ValidationIssue[];
}

export interface DataSourceAdapter {
  load(): Promise<RawDataBundle>;
}

export class DataContractError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = 'DataContractError';
    this.issues = issues;
  }
}

export function formatDataContractError(error: unknown): string {
  if (!(error instanceof DataContractError)) return 'The configured data source could not be loaded.';
  const first = error.issues.find((issue) => issue.severity === 'error');
  return first ? `The data source does not match contract v1: ${first.message}` : error.message;
}
