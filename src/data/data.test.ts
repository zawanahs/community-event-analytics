import { describe, expect, it } from 'vitest';
import { loadData } from './load';
import { normalizeSource } from './normalize';
import { validateSource } from './validate';
import { DataContractError } from './contract';
import { createSyntheticAdapter } from './adapters/synthetic';
import type { DataSourceAdapter, RawDataBundle, RawDatasets } from './contract';

const source = {
  sourceLabel: 'Test source',
  sourceKind: 'test',
  dataClassification: 'synthetic' as const,
  fetchedAt: new Date('2026-01-15T00:00:00Z'),
  reportingTimezone: 'UTC',
  contractVersion: 1 as const,
  historyStart: null,
  historyEnd: null,
  limitations: [],
};

function bundle(overrides: Partial<RawDatasets> = {}): RawDataBundle {
  return {
    source,
    datasets: {
      events: [{
        event_id: 'event-1',
        event_name: 'Community meetup',
        event_date: '2026-01-10',
        format: 'Meetup',
        topic_primary: 'Community',
        registered: '25',
        attended: '20',
        year_median_registered: '20',
      }],
      surveyResponses: [{
        response_id: 'response-1',
        event_id: 'event-1',
        satisfaction_1_10: '9',
        recommend_1_10: '10',
        years_exp: '2-3 years',
      }],
      feedbackAnswers: [{
        response_id: 'response-1',
        event_id: 'event-1',
        canonical_field: 'text_good',
        text: 'Friendly and practical.',
      }],
      registrations: [{
        registrant_hash: 'participant-1',
        event_id: 'event-1',
        gender: 'Not stated',
        attendance_known: 'YES',
        attended: '1',
      }],
      participants: [{
        registrant_hash: 'participant-1',
        events_registered: '2',
        events_attended: '1',
        is_returning_registered: 'TRUE',
        is_returning: 'FALSE',
      }],
      ...overrides,
    },
  };
}

describe('contract v1 normalization', () => {
  it('maps legacy source columns to canonical fields and preserves metadata', () => {
    const normalized = validateSource(normalizeSource(bundle()));

    expect(normalized.datasets.events[0]).toMatchObject({
      event_id: 'event-1',
      event_date: '2026-01-10',
      registered: 25,
      attended: 20,
      demand_index: 1.25,
    });
    expect(normalized.datasets.surveyResponses[0].experience_segment).toBe('2-3 years');
    expect(normalized.datasets.feedbackAnswers[0].question_role).toBe('positive');
    expect(normalized.datasets.registrations[0]).toMatchObject({
      participant_id: 'participant-1',
      attended: true,
      attendance_known: true,
    });
    expect(normalized.source.dataClassification).toBe('synthetic');
  });

  it('preserves missing optional measurements as null instead of zero', () => {
    const normalized = validateSource(normalizeSource(bundle({
      events: [{ event_id: 'event-1', event_name: 'Community meetup', event_date: '2026-01-10' }],
    })));

    expect(normalized.datasets.events[0]).toMatchObject({
      registered: null,
      attended: null,
      capacity: null,
      demand_index: null,
    });
  });

  it('rejects orphaned joins with a structured contract error', () => {
    const invalid = normalizeSource(bundle({
      feedbackAnswers: [{ response_id: 'missing-response', event_id: 'event-1', canonical_field: 'text_good', text: 'Useful.' }],
    }));

    expect(() => validateSource(invalid)).toThrow(DataContractError);
    try {
      validateSource(invalid);
    } catch (error) {
      expect((error as DataContractError).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'orphan_response', dataset: 'feedbackAnswers' }),
      ]));
    }
  });

  it('rejects inconsistent lifetime-returning status', () => {
    const invalid = normalizeSource(bundle({
      participants: [{ registrant_hash: 'participant-1', events_registered: '1', is_returning_registered: 'TRUE' }],
    }));

    expect(() => validateSource(invalid)).toThrowError(/validation failed/i);
  });
});

describe('dashboard assembly', () => {
  it('loads through the adapter boundary and derives source history', async () => {
    const adapter: DataSourceAdapter = { load: async () => bundle() };
    const data = await loadData(adapter);

    expect(data.eventsById.get('event-1')?.event_name).toBe('Community meetup');
    expect(data.persons.get('participant-1')?.is_returning_registered).toBe(true);
    expect(data.satByEvent.get('event-1')).toBe(9);
    expect(data.source).toMatchObject({
      contractVersion: 1,
      historyStart: '2026-01-10',
      historyEnd: '2026-01-10',
    });
  });

  it('loads a full, contract-valid synthetic community', async () => {
    const data = await loadData(createSyntheticAdapter());

    expect(data.source.dataClassification).toBe('synthetic');
    expect(data.events).toHaveLength(24);
    expect(data.persons.size).toBe(280);
    expect(data.registrations.length).toBeGreaterThan(350);
    expect(data.responses.length).toBeGreaterThan(100);
    expect(data.feedback.length).toBeGreaterThan(data.responses.length);
    expect(data.events.filter((event) => event.feedback_responses === 0).length).toBeGreaterThanOrEqual(2);
    expect(data.registrations.some((row) => row.attendance_known === false)).toBe(true);
    expect(data.registrations.some((row) => row.gender_segment == null)).toBe(true);
    expect([...data.persons.values()].some((person) => person.is_returning_registered)).toBe(true);
  });

  it('generates deterministic rows and contains no organizer source material', async () => {
    const adapter = createSyntheticAdapter();
    const first = await adapter.load();
    const second = await adapter.load();

    expect(first.datasets).toEqual(second.datasets);
    const serialized = JSON.stringify(first.datasets).toLowerCase();
    expect(serialized).not.toMatch(/@[a-z0-9.-]+|\+65|https?:\/\//);
  });
});
