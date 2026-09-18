// Stable dashboard-facing facade. Source adapters, canonical normalization,
// validation, and assembly live under src/data/.
export { loadData, median } from './data/load';
export { parseDate } from './data/normalize';
export { DataContractError, formatDataContractError } from './data/contract';
export type { DataSourceAdapter, RawDataBundle, RawDatasets } from './data/contract';

import type { DashboardData, DataSlice, EventRecord } from './types';

export interface DashboardFilters {
  format: string;
  topic: string;
  eventId: string;
  from: Date | null;
  to: Date | null;
}

export const filters: DashboardFilters = { format: '', topic: '', eventId: '', from: null, to: null };
const listeners = new Set<(filters: DashboardFilters) => void>();

export const onFilterChange = (listener: (filters: DashboardFilters) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setFilters(patch: Partial<DashboardFilters>) {
  Object.assign(filters, patch);
  listeners.forEach((listener) => listener(filters));
}

export function filteredEvents(data: DashboardData): EventRecord[] {
  return data.events.filter((event) => {
    if (filters.eventId && event.event_id !== filters.eventId) return false;
    if (filters.format && event.format !== filters.format) return false;
    if (filters.topic && event.topic_primary !== filters.topic) return false;
    if (filters.from && (!event.date || event.date < filters.from)) return false;
    if (filters.to && (!event.date || event.date > filters.to)) return false;
    return true;
  });
}

export function scoped(data: DashboardData): DataSlice {
  const events = filteredEvents(data);
  const eventIds = new Set(events.map((event) => event.event_id));
  return {
    events,
    responses: data.responses.filter((row) => eventIds.has(row.event_id)),
    feedback: data.feedback.filter((row) => eventIds.has(row.event_id)),
    registrations: data.registrations.filter((row) => eventIds.has(row.event_id)),
  };
}
