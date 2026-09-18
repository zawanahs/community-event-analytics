import type { DataSourceAdapter, RawDataBundle } from '../contract';
import type { RawRow } from '../../types';

const EVENT_SPECS = [
  ['2025-01-18', 'Welcome Night: Finding Your Community', 'Networking', 'Community'],
  ['2025-02-08', 'Practical Data Storytelling', 'Workshop', 'Data'],
  ['2025-03-06', 'Career Conversations That Work', 'Talk', 'Career'],
  ['2025-03-29', 'Designing Inclusive Digital Services', 'Workshop', 'Design'],
  ['2025-04-17', 'Open Source First Steps', 'Workshop', 'Open Source'],
  ['2025-05-10', 'Mentor Matching Spring Session', 'Mentorship', 'Career'],
  ['2025-06-04', 'Building Reliable Web Services', 'Talk', 'Software Engineering'],
  ['2025-06-28', 'Community Project Sprint', 'Hackathon', 'Community'],
  ['2025-07-16', 'Speaking With Confidence', 'Workshop', 'Soft Skills'],
  ['2025-08-09', 'Applied AI Without the Hype', 'Talk', 'AI'],
  ['2025-09-03', 'Product Discovery in Practice', 'Workshop', 'Product'],
  ['2025-09-27', 'Autumn Community Social', 'Networking', 'Community'],
  ['2025-10-15', 'Contributing to Open Source Together', 'Workshop', 'Open Source'],
  ['2025-11-08', 'Systems Thinking for Growing Products', 'Talk', 'Software Engineering'],
  ['2025-12-03', 'Year-End Lessons and Connections', 'Networking', 'Community'],
  ['2026-01-17', 'Setting a Sustainable Career Direction', 'Workshop', 'Career'],
  ['2026-02-11', 'Responsible AI for Community Projects', 'Talk', 'AI'],
  ['2026-03-07', 'Build for Good Project Day', 'Hackathon', 'Community'],
  ['2026-04-02', 'From User Research to Better Services', 'Workshop', 'Design'],
  ['2026-04-25', 'Mentor Matching Spring Session', 'Mentorship', 'Career'],
  ['2026-05-14', 'Modern Frontend Patterns', 'Talk', 'Software Engineering'],
  ['2026-06-06', 'Data Skills for Everyday Decisions', 'Workshop', 'Data'],
  ['2026-07-09', 'Leading Through Influence', 'Workshop', 'Soft Skills'],
  ['2026-08-01', 'Summer Community Exchange', 'Networking', 'Community'],
] as const;

const FORMATS_WITH_CAPACITY = new Set(['Workshop', 'Hackathon', 'Mentorship']);
const EXPERIENCE = ['Student', '0-2', '3-5', '6-10', '10+', null] as const;
const GENDERS = ['Female', 'Male', 'Other', null] as const;
const JOB_FAMILIES = ['Engineering', 'Product', 'Design', 'Data', 'Operations', 'Education', 'Founder', null] as const;
const SECTORS = ['Private', 'Public', 'Academia', 'Non-profit', 'Self-employed', null] as const;
const ORGANIZATIONS = ['Example Labs', 'Demo Public Service', 'Sample University', 'Illustration Studio', 'Independent', null] as const;

const POSITIVE = [
  'The practical examples made the topic easy to apply.',
  'The facilitator explained the ideas clearly and welcomed questions.',
  'The small-group discussion made it easy to meet other participants.',
  'The session was well structured and friendly to beginners.',
  'The hands-on activity helped turn the concepts into something concrete.',
  'The examples felt realistic and relevant to day-to-day work.',
  'The relaxed atmosphere made it comfortable to contribute.',
  'The mix of explanation and practice worked especially well.',
];

const IMPROVEMENT = [
  'Allow more time for hands-on practice and discussion.',
  'Share the agenda and preparation notes a few days earlier.',
  'Make the question-and-answer section longer.',
  'Provide the slides and useful links after the event.',
  'Use a microphone and check visibility from the back of the room.',
  'Label the expected experience level more clearly.',
  'Leave more time between activities so the session feels less rushed.',
  'Add more tables and make the group instructions clearer.',
];

const TOPIC_REQUESTS = [
  'More practical sessions about responsible AI.',
  'A deeper workshop on system design.',
  'More career transition and interview practice.',
  'Community-led open source project sessions.',
  'More product discovery and user research workshops.',
  'A session about data visualization and storytelling.',
  'More opportunities for mentoring and peer learning.',
  'Workshops on facilitation, leadership and public speaking.',
];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const choose = <T>(random: () => number, values: readonly T[]): T => values[Math.floor(random() * values.length)];
const weightedIndex = (random: () => number, weights: readonly number[]) => {
  const target = random() * weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  for (let index = 0; index < weights.length; index += 1) {
    cursor += weights[index];
    if (target < cursor) return index;
  }
  return weights.length - 1;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function surveyExperience(registrationExperience: string | null): string | null {
  const mapping: Record<string, string> = {
    Student: '0-1 year',
    '0-2': '0-1 year',
    '3-5': '3-4 years',
    '6-10': '5-6 years',
    '10+': '7+ years',
  };
  return registrationExperience ? mapping[registrationExperience] ?? null : null;
}

function generateSyntheticBundle(): RawDataBundle {
  const random = seededRandom(20260917);
  const profiles = Array.from({ length: 280 }, (_, index) => {
    const teamMember = index % 47 === 0;
    return {
      participant_id: `sample-participant-${String(index + 1).padStart(3, '0')}`,
      experience_segment: EXPERIENCE[weightedIndex(random, [8, 27, 28, 21, 12, 4])],
      gender_segment: GENDERS[weightedIndex(random, [52, 35, 8, 5])],
      job_family_segment: JOB_FAMILIES[weightedIndex(random, [31, 16, 13, 14, 10, 6, 5, 5])],
      sector_segment: SECTORS[weightedIndex(random, [49, 17, 9, 8, 10, 7])],
      organization_segment: teamMember ? 'Sample Community Team' : ORGANIZATIONS[weightedIndex(random, [25, 16, 12, 10, 24, 13])],
      teamMember,
    };
  });

  const registrations: RawRow[] = [];
  const registeredByEvent = Array(EVENT_SPECS.length).fill(0);
  const attendedByEvent = Array(EVENT_SPECS.length).fill(0);
  const registrationCountByParticipant = new Map<string, number>();
  const attendanceCountByParticipant = new Map<string, number>();

  for (const profile of profiles) {
    const eventCount = [1, 2, 3, 4][weightedIndex(random, [62, 25, 10, 3])];
    const selected = new Set<number>();
    while (selected.size < eventCount) selected.add(Math.floor(random() * EVENT_SPECS.length));

    for (const eventIndex of selected) {
      const attendanceKnown = random() >= 0.045;
      const attended = attendanceKnown ? random() < 0.76 : null;
      registrations.push({
        participant_id: profile.participant_id,
        event_id: `sample-event-${String(eventIndex + 1).padStart(2, '0')}`,
        experience_segment: profile.experience_segment,
        gender_segment: profile.gender_segment,
        job_family_segment: profile.job_family_segment,
        sector_segment: profile.sector_segment,
        organization_segment: profile.organization_segment,
        attendance_known: attendanceKnown,
        attended,
        status: 'confirmed',
      });
      registeredByEvent[eventIndex] += 1;
      registrationCountByParticipant.set(profile.participant_id, (registrationCountByParticipant.get(profile.participant_id) ?? 0) + 1);
      if (attended === true) {
        attendedByEvent[eventIndex] += 1;
        attendanceCountByParticipant.set(profile.participant_id, (attendanceCountByParticipant.get(profile.participant_id) ?? 0) + 1);
      }
    }
  }

  const participants: RawRow[] = profiles.map((profile) => {
    const eventsRegistered = registrationCountByParticipant.get(profile.participant_id) ?? 0;
    const eventsAttended = attendanceCountByParticipant.get(profile.participant_id) ?? 0;
    return {
      participant_id: profile.participant_id,
      events_registered: eventsRegistered,
      events_attended: eventsAttended,
      is_returning_registered: eventsRegistered >= 2,
      is_returning_attended: eventsAttended >= 2,
    };
  });

  const surveyResponses: RawRow[] = [];
  const feedbackAnswers: RawRow[] = [];
  const responsesByEvent = Array(EVENT_SPECS.length).fill(0);
  let responseNumber = 0;

  for (const registration of registrations) {
    if (registration.attended !== true) continue;
    const eventIndex = Number(String(registration.event_id).slice(-2)) - 1;
    if ([5, 17].includes(eventIndex) || random() > 0.47) continue;
    responseNumber += 1;
    responsesByEvent[eventIndex] += 1;
    const responseId = `sample-response-${String(responseNumber).padStart(4, '0')}`;
    const quality = 7.2 + ((eventIndex * 7) % 9) / 10;
    const satisfaction = clamp(Math.round(quality + (random() - 0.45) * 2.4), 4, 10);
    const recommend = clamp(Math.round(satisfaction + (random() - 0.5) * 1.8), 3, 10);
    const profile = profiles.find((candidate) => candidate.participant_id === registration.participant_id)!;
    surveyResponses.push({
      response_id: responseId,
      event_id: registration.event_id,
      satisfaction,
      recommend,
      experience_segment: surveyExperience(profile.experience_segment),
    });

    feedbackAnswers.push({ response_id: responseId, event_id: registration.event_id, question_role: 'positive', text: choose(random, POSITIVE) });
    if (random() < 0.78) feedbackAnswers.push({ response_id: responseId, event_id: registration.event_id, question_role: 'improvement', text: choose(random, IMPROVEMENT) });
    if (random() < 0.58) feedbackAnswers.push({ response_id: responseId, event_id: registration.event_id, question_role: 'topic_request', text: choose(random, TOPIC_REQUESTS) });
  }

  const years = [...new Set(EVENT_SPECS.map(([date]) => date.slice(0, 4)))];
  const mediansByYear = new Map(years.map((year) => [year, median(EVENT_SPECS.map(([date], index) => date.startsWith(year) ? registeredByEvent[index] : null).filter((value): value is number => value != null))]));
  const events: RawRow[] = EVENT_SPECS.map(([date, name, format, topic], index) => {
    const yearMedian = mediansByYear.get(date.slice(0, 4))!;
    const registered = registeredByEvent[index];
    return {
      event_id: `sample-event-${String(index + 1).padStart(2, '0')}`,
      event_name: name,
      event_date: date,
      format,
      topic_primary: topic,
      registered,
      attended: attendedByEvent[index],
      capacity: FORMATS_WITH_CAPACITY.has(format) && index % 4 !== 0 ? registered + 12 + (index % 3) * 8 : null,
      feedback_responses: responsesByEvent[index],
      year_median_registered: yearMedian,
      demand_index: +(registered / yearMedian).toFixed(3),
    };
  });

  return {
    datasets: { events, surveyResponses, feedbackAnswers, registrations, participants },
    source: {
      sourceLabel: 'Synthetic demo data',
      sourceKind: 'synthetic',
      dataClassification: 'synthetic',
      fetchedAt: new Date(),
      reportingTimezone: 'UTC',
      contractVersion: 1,
      historyStart: null,
      historyEnd: null,
      limitations: ['Generated demonstration data. Values and comments do not describe real people, events, or organizations.'],
    },
  };
}

export function createSyntheticAdapter(): DataSourceAdapter {
  return { load: async () => generateSyntheticBundle() };
}
