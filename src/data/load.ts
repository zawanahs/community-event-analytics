import { createGoogleSheetsAdapter } from './adapters/google-sheets';
import { createSyntheticAdapter } from './adapters/synthetic';
import { communityConfig } from '../config';
import { normalizeSource } from './normalize';
import { validateSource } from './validate';
import type { DataSourceAdapter } from './contract';
import type { DashboardData } from '../types';

export const median = (values: Array<number | null>): number | null => {
  const sorted = values.filter((value): value is number => value != null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const configuredAdapter = (): DataSourceAdapter =>
  communityConfig.data.sourceKind === 'google-sheets' ? createGoogleSheetsAdapter() : createSyntheticAdapter();

export async function loadData(adapter: DataSourceAdapter = configuredAdapter()): Promise<DashboardData> {
  const normalized = validateSource(normalizeSource(await adapter.load()));
  const { events, surveyResponses, feedbackAnswers, registrations, participants } = normalized.datasets;
  const eventsById = new Map(events.map((event) => [event.event_id, event]));
  const persons = new Map(participants.map((person) => [person.participant_id, person]));

  const satisfactionTotals = new Map<string, { sum: number; count: number }>();
  for (const response of surveyResponses) {
    if (response.satisfaction == null) continue;
    const total = satisfactionTotals.get(response.event_id) ?? { sum: 0, count: 0 };
    total.sum += response.satisfaction;
    total.count += 1;
    satisfactionTotals.set(response.event_id, total);
  }
  const satByEvent = new Map(events.map((event) => {
    const total = satisfactionTotals.get(event.event_id);
    return [event.event_id, total ? total.sum / total.count : null] as const;
  }));

  const datedEvents = events.filter((event) => event.date).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  const source = {
    ...normalized.source,
    historyStart: datedEvents[0]?.event_date ?? null,
    historyEnd: datedEvents.at(-1)?.event_date ?? null,
    limitations: [...normalized.source.limitations, ...normalized.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message)],
  };

  return {
    events,
    eventsById,
    responses: surveyResponses,
    feedback: feedbackAnswers,
    registrations,
    persons,
    satByEvent,
    refs: { medianDemand: median(events.map((event) => event.demand_index)), medianSatisfaction: median([...satByEvent.values()]) },
    source,
    validationIssues: normalized.issues,
    fetchedAt: source.fetchedAt,
  };
}
