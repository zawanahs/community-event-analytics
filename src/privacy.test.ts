import { describe, expect, it } from 'vitest';
import { canShowFeedback, disclosureGroups, protectedCrossTab } from './privacy';

type Row = { group: string; child?: string; response_id?: string; participant_id?: string };
const rows = (group: string, count: number, child?: string): Row[] =>
  Array.from({ length: count }, (_, index) => ({ group, child, response_id: `${group}-${index}` }));

describe('privacy suppression', () => {
  it('pools multiple small mutually exclusive groups only when their combined size is safe', () => {
    const result = disclosureGroups([...rows('Established', 12), ...rows('New', 5), ...rows('Student', 5)], (row) => row.group);

    expect(result.hasUnsafeRemainder).toBe(false);
    expect(result.groups.map((group) => [group.key, group.count])).toEqual([
      ['Established', 12],
      ['Other / small groups', 10],
    ]);
  });

  it('does not provide a displayed total that could reveal a single suppressed group by subtraction', () => {
    const result = disclosureGroups([...rows('Established', 12), ...rows('New', 4)], (row) => row.group);

    expect(result.hasUnsafeRemainder).toBe(true);
    expect(result.groups.map((group) => group.key)).toEqual(['Established']);
  });

  it('hides cross-tab parents with an unsafe child instead of exposing them in a stacked total', () => {
    const input = [
      ...rows('Meetup', 10, 'Group A'),
      ...rows('Meetup', 3, 'Group B'),
      ...rows('Workshop', 10, 'Group A'),
      ...rows('Workshop', 10, 'Group B'),
    ];
    const result = protectedCrossTab(input, (row) => row.group, (row) => row.child ?? 'Unknown');

    expect(result.map((group) => group.key)).toEqual(['Workshop']);
    expect(result[0].count).toBe(20);
  });

  it('allows free-text feedback only at the configured minimum number of distinct respondents', () => {
    const nineRows = Array.from({ length: 9 }, (_, index) => ({ response_id: `response-${index}` }));
    const tenRows = Array.from({ length: 10 }, (_, index) => ({ response_id: `response-${index}` }));

    expect(canShowFeedback([...nineRows, ...nineRows])).toBe(false);
    expect(canShowFeedback(tenRows)).toBe(true);
  });

  it('does not treat repeated registrations from one participant as a safe segment', () => {
    const repeated = Array.from({ length: 10 }, (_, index) => ({
      group: 'Small segment',
      participant_id: 'participant-1',
      response_id: `registration-${index}`,
    }));

    const result = disclosureGroups(repeated, (row) => row.group, (row) => row.participant_id);

    expect(result.groups).toEqual([]);
    expect(result.hasUnsafeRemainder).toBe(true);
  });

  it('allows a segment with the minimum number of distinct participants', () => {
    const distinct = Array.from({ length: 10 }, (_, index) => ({
      group: 'Safe segment',
      participant_id: `participant-${index}`,
    }));

    const result = disclosureGroups(distinct, (row) => row.group, (row) => row.participant_id);

    expect(result.groups[0]).toMatchObject({ count: 10, privacyCount: 10 });
    expect(result.hasUnsafeRemainder).toBe(false);
  });
});
