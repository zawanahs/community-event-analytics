export type RawRow = Record<string, unknown>;

export type DataClassification = 'synthetic' | 'anonymized' | 'confidential' | 'public';

export interface SourceMetadata {
  sourceLabel: string;
  sourceKind: string;
  dataClassification: DataClassification;
  fetchedAt: Date;
  reportingTimezone: string;
  contractVersion: 1;
  historyStart: string | null;
  historyEnd: string | null;
  limitations: string[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  dataset: string;
  row?: number;
  field?: string;
  message: string;
}

export interface EventRecord extends RawRow {
  event_id: string;
  event_name: string;
  event_date: string;
  format: string | null;
  topic_primary: string | null;
  date: Date | null;
  registered: number | null;
  attended: number | null;
  capacity: number | null;
  feedback_responses: number | null;
  year_median_registered: number | null;
  demand_index: number | null;
}

export interface ResponseRecord extends RawRow {
  response_id: string;
  event_id: string;
  satisfaction: number | null;
  recommend: number | null;
  experience_segment: string | null;
}

export interface FeedbackRecord extends RawRow {
  response_id: string;
  event_id: string;
  question_role: string;
  text: string;
  score?: number;
  label?: 'positive' | 'neutral' | 'negative';
}

export interface PersonRecord extends RawRow {
  participant_id: string;
  events_registered: number | null;
  events_attended: number | null;
  is_returning_attended: boolean | null;
  is_returning_registered: boolean | null;
}

export interface RegistrationRecord extends RawRow {
  participant_id: string;
  event_id: string;
  gender_segment: string | null;
  sector_segment: string | null;
  job_family_segment: string | null;
  experience_segment: string | null;
  organization_segment: string | null;
  attended: boolean | null;
  attendance_known: boolean | null;
  person: PersonRecord | null;
}

export interface DashboardData {
  events: EventRecord[];
  eventsById: Map<string, EventRecord>;
  responses: ResponseRecord[];
  feedback: FeedbackRecord[];
  registrations: RegistrationRecord[];
  persons: Map<string, PersonRecord>;
  satByEvent: Map<string, number | null>;
  refs: { medianDemand: number | null; medianSatisfaction: number | null };
  source: SourceMetadata;
  validationIssues: ValidationIssue[];
  fetchedAt: Date;
}

export interface DataSlice {
  events: EventRecord[];
  responses: ResponseRecord[];
  feedback: FeedbackRecord[];
  registrations: RegistrationRecord[];
}

export interface DashboardController {
  update: () => void;
  resize: () => void;
  dispose?: () => void;
}
