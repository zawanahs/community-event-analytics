// Pure metric computations over the filtered slice.
import { communityConfig, surveyExperienceOrder } from './config';

export const fmtPct = (v, dp = 0) => (v == null || isNaN(v) ? '–' : (v * 100).toFixed(dp) + '%');
export const fmtNum = (v, dp = 1) => (v == null || isNaN(v) ? '–' : Number(v).toFixed(dp));
export const fmtInt = (v) => (v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString());

const sumKnown = (values) => {
  const known = values.filter((value) => value != null && !isNaN(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
};

// ── Dashboard 1 KPIs ─────────────────────────────────────────────────────────
export function kpisEffectiveness(slice) {
  const { events, responses, registrations } = slice;
  const uniqueEvents = new Set(events.map((e) => e.event_id)).size;

  const sats = responses.map((r) => r.satisfaction).filter((v) => v != null);
  const avgSatisfaction = sats.length ? sats.reduce((a, b) => a + b, 0) / sats.length : null;

  const totalAttended = sumKnown(events.map((e) => e.attended));
  const responseCount = new Set(responses.map((response) => response.response_id)).size;
  const responseRate = totalAttended != null && totalAttended > 0 ? responseCount / totalAttended : null;

  const totalRegistered = sumKnown(events.map((e) => e.registered));
  const people = new Map();
  for (const r of registrations) if (r.person?.is_returning_registered != null) people.set(r.participant_id, r.person);
  const returning = [...people.values()].filter((p) => p.is_returning_registered === true).length;
  const returningRate = people.size ? returning / people.size : null;

  const byTopic = new Map();
  for (const e of events) {
    if (e.topic_primary == null || e.attended == null) continue;
    byTopic.set(e.topic_primary, (byTopic.get(e.topic_primary) ?? 0) + e.attended);
  }
  const hotTopic = [...byTopic.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return { uniqueEvents, avgSatisfaction, responseRate, responses: responseCount, totalAttended, totalRegistered, returningRate, hotTopic };
}

// ── overall verdict, from the satisfaction rating ────────────────────────────
// Deliberately NOT from lexicon-scored free text: that score mostly restates
// which survey question was answered (every "what was good" answer scores
// positive by construction), so it cannot say whether attendees were happy.
// satisfaction_1_10 is a rating attendees actually gave.
export const SAT_BANDS = { positive: 8, neutral: 6 };

export function satisfactionVerdict(responses) {
  const sats = responses.map((r) => r.satisfaction).filter((v) => v != null);
  if (!sats.length) return null;
  const mean = sats.reduce((a, b) => a + b, 0) / sats.length;
  const label = mean >= SAT_BANDS.positive ? 'positive' : mean >= SAT_BANDS.neutral ? 'neutral' : 'negative';
  return {
    label,
    mean,
    total: sats.length,
    highShare: sats.filter((v) => v >= SAT_BANDS.positive).length / sats.length,
  };
}

// ── quadrant scatter: per event, or aggregated by topic_primary / format ─────
export function quadrantPoints(slice, satByEvent, mode) {
  const withSat = slice.events.filter((e) => satByEvent.get(e.event_id) != null && e.demand_index != null && e.registered != null);
  const skipped = slice.events.length - withSat.length;

  if (mode === 'event') {
    return {
      points: withSat.map((e) => ({
        id: e.event_id, // click target: drills the feedback section to this event
        name: e.event_name.replace(/_/g, ' '),
        satisfaction: satByEvent.get(e.event_id),
        demand: e.demand_index,
        registered: e.registered,
        events: 1,
        detail: `${e.format ?? 'Format not stated'} · ${e.topic_primary ?? 'Topic not stated'} · ${e.event_date}`,
      })),
      skipped,
    };
  }
  const key = mode === 'topic' ? 'topic_primary' : 'format';
  const groups = new Map();
  for (const e of withSat) {
    if (e[key] == null) continue;
    const g = groups.get(e[key]) ?? { satW: 0, respW: 0, demandSum: 0, registered: 0, n: 0 };
    const resp = slice.responses.filter((response) => response.event_id === e.event_id && response.satisfaction != null).length;
    if (!resp) continue;
    g.satW += satByEvent.get(e.event_id) * resp;
    g.respW += resp;
    g.demandSum += e.demand_index; // demand = simple mean of event demand indices
    g.registered += e.registered;
    g.n += 1;
    groups.set(e[key], g);
  }
  return {
    points: [...groups.entries()].map(([name, g]) => ({
      id: name, // topic_primary / format value, the click target for that mode
      name,
      satisfaction: g.satW / g.respW,
      demand: g.demandSum / g.n,
      registered: g.registered,
      events: g.n,
      detail: `${g.n} event${g.n > 1 ? 's' : ''} · ${g.registered} registered`,
    })),
    skipped,
  };
}

export const quadrantAction = (sat, demand, refs) => {
  const hiSat = sat >= refs.medianSatisfaction, hiDem = demand >= refs.medianDemand;
  if (hiSat && hiDem) return 'Scale';
  if (!hiSat && hiDem) return 'Improve';
  if (hiSat && !hiDem) return 'Maintain';
  return 'Deprioritise';
};

// ── Dashboard 2 ──────────────────────────────────────────────────────────────
export function kpisCommunity(slice) {
  const { registrations } = slice;
  const people = new Map();
  for (const r of registrations) if (!people.has(r.participant_id)) people.set(r.participant_id, r);

  const genderCounts = countBy(registrations, (r) => r.gender_segment ?? 'Not stated');

  // % of unique registrants who came back for another event, easier to read at a
  // glance than a mean event count and consistent with the event-effectiveness KPI
  const persons = [...people.keys()].map((h) => people.get(h).person).filter((person) => person?.is_returning_registered != null);
  const returning = persons.filter((p) => p.is_returning_registered === true).length;
  const returningRate = persons.length ? returning / persons.length : null;

  const sectorCounts = countBy(registrations, (r) => r.sector_segment ?? 'Not stated');
  const topSector = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  const sectorTotal = registrations.length;

  return { uniquePeople: people.size, genderCounts, returningRate, topSector, sectorTotal };
}

export function countBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// counts of key2 within each key1, e.g. gender within YOE bucket
export function crossTab(rows, key1Fn, key2Fn) {
  const m = new Map();
  for (const r of rows) {
    const k1 = key1Fn(r);
    if (!m.has(k1)) m.set(k1, new Map());
    const inner = m.get(k1);
    const k2 = key2Fn(r);
    inner.set(k2, (inner.get(k2) ?? 0) + 1);
  }
  return m;
}

export const YOE_ORDER = [...communityConfig.segments.experience.order];
export const SURVEY_YOE_ORDER = [...surveyExperienceOrder];

// ── segment × outcome ────────────────────────────────────────────────────────
// YOE: response-level (the survey captures years_exp on each anonymous response).
// field is 'satisfaction' or 'recommend'.
export function outcomeByYoe(slice, field) {
  const groups = new Map();
  for (const r of slice.responses) {
    if (r[field] == null) continue;
    const bucket = r.experience_segment ?? 'Not stated';
    const g = groups.get(bucket) ?? { sum: 0, n: 0 };
    g.sum += r[field];
    g.n += 1;
    groups.set(bucket, g);
  }
  return [...groups.entries()].map(([bucket, g]) => ({ bucket, avg: g.sum / g.n, n: g.n }));
}

// promoter (9-10) / passive (7-8) / detractor (<=6) split, response-level by survey YOE
export function distributionByYoe(slice) {
  const groups = new Map();
  for (const r of slice.responses) {
    if (r.satisfaction == null) continue;
    const bucket = r.experience_segment ?? 'Not stated';
    const g = groups.get(bucket) ?? { promoters: 0, passives: 0, detractors: 0, n: 0 };
    if (r.satisfaction >= 9) g.promoters++;
    else if (r.satisfaction >= 7) g.passives++;
    else g.detractors++;
    g.n++;
    groups.set(bucket, g);
  }
  return [...groups.entries()].map(([bucket, g]) => ({ bucket, ...g }));
}


// person-level returning rate per segment, behaviour, not stated opinion, and valid
// for every segment dimension since it never touches the anonymous survey
export function returningBySegment(slice, keyFn) {
  const groups = new Map();
  for (const r of slice.registrations) {
    const k = keyFn(r);
    const g = groups.get(k) ?? { people: new Set(), returners: new Set() };
    if (r.person?.is_returning_registered == null) continue;
    g.people.add(r.participant_id);
    if (r.person.is_returning_registered) g.returners.add(r.participant_id);
    groups.set(k, g);
  }
  return [...groups.entries()].map(([bucket, g]) => ({
    bucket,
    rate: g.people.size ? g.returners.size / g.people.size : null,
    n: g.people.size,
    directional: false,
  }));
}

