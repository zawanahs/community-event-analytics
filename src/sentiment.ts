// Lexicon (AFINN) sentiment with a prior from the survey question the text answers:
// The canonical question roles describe the intent of the configured survey
// question without coupling the analysis to one source's column values.
import Sentiment from 'sentiment';
import { communityConfig } from './config';

const analyzer = new Sentiment();

// "nothing to improve" style answers to text_improve are actually praise
const NOTHING_RE = /^(nothing|none|nil|nope|no|n\/?a|-|all good|nothing much|nothing really|nothing so far|no comments?|keep it up|great as is)[.!\s]*$/i;
// bare "nothing/none", under text_good this means nothing WAS good
const NONE_RE = /^(nothing|none|nil|nope|no|n\/?a|-)[.!\s]*$/i;

export function scoreFeedback(row) {
  const text = row.text.trim();
  const comparative = analyzer.analyze(text).comparative;

  // the question asked carries most of the signal: an answer to "what was good"
  // names praise even when the lexicon misreads a word ("mock interview")
  if (row.question_role === 'positive') {
    if (NONE_RE.test(text)) return { score: comparative, label: 'negative' };
    return { score: comparative, label: comparative < -0.5 ? 'neutral' : 'positive' };
  }
  if (row.question_role === 'improvement' && NOTHING_RE.test(text)) {
    return { score: comparative, label: 'positive' };
  }
  const prior = row.question_role === 'improvement' ? -0.1 : 0;
  const adjusted = comparative + prior;
  const label = adjusted > 0.05 ? 'positive' : adjusted < -0.05 ? 'negative' : 'neutral';
  return { score: comparative, label };
}

export function annotateFeedback(feedback) {
  return feedback.map((row) => ({ ...row, ...scoreFeedback(row) }));
}

export function sentimentSplit(rows) {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) counts[r.label]++;
  const total = rows.length || 1;
  return {
    counts,
    total: rows.length,
    share: {
      positive: counts.positive / total,
      neutral: counts.neutral / total,
      negative: counts.negative / total,
    },
  };
}

export const FIELD_LABELS = Object.fromEntries(
  communityConfig.feedbackRoles.map((role) => [role.id, role.label]),
);

// ── keyword-theme summaries (deterministic, no API, labelled "directional" in the UI) ──

const STOPWORDS = new Set(
  `a an and are as at be been but by can could did do for from had has have i if in into is it its me my nil no none not of on or our so than that the their them they this to too very was we were what when which who will with would you your yours it's i'm don't didn't wasn't event events session sessions workshop talk talks really quite bit lot much many just also there here about overall maybe perhaps more good great nice well better best like liked love loved enjoy enjoyed nothing na all some any how get got make made keep those these things thing way s t ve d nil -`.split(/\s+/),
);
// words kept out of unigram themes but allowed inside bigrams ("more time", "hands on")
const BIGRAM_OK = new Set(['more', 'hands', 'less', 'too']);

const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9'&+ -]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

// top recurring themes across comments: bigrams first, then unigrams, counted per-comment
export function extractThemes(rows, max = 5) {
  const uni = new Map();
  const bi = new Map();
  for (const r of rows) {
    const toks = tokenize(r.text);
    const seenU = new Set();
    const seenB = new Set();
    toks.forEach((t, i) => {
      if (t.length > 2 && !STOPWORDS.has(t) && !seenU.has(t)) {
        seenU.add(t);
        uni.set(t, (uni.get(t) ?? 0) + 1);
      }
      if (i < toks.length - 1) {
        const a = toks[i], b = toks[i + 1];
        const ok = (w) => (!STOPWORDS.has(w) || BIGRAM_OK.has(w)) && w.length > 1;
        if (ok(a) && ok(b) && !(STOPWORDS.has(a) && STOPWORDS.has(b))) {
          const g = `${a} ${b}`;
          if (!seenB.has(g)) {
            seenB.add(g);
            bi.set(g, (bi.get(g) ?? 0) + 1);
          }
        }
      }
    });
  }
  const bigrams = [...bi.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  const chosen = bigrams.slice(0, max);
  const inBigram = new Set(chosen.flatMap(([g]) => g.split(' ')));
  const unigrams = [...uni.entries()]
    .filter(([w, n]) => n >= 3 && !inBigram.has(w))
    .sort((a, b) => b[1] - a[1]);
  return [...chosen, ...unigrams].slice(0, max).map(([theme, count]) => ({ theme, count }));
}

// Comments to quote verbatim. Ranked by how much they actually say (length as a
// proxy for specificity, within a readable range) rather than by lexicon score,
// which cannot tell a specific answer from a generic one.
export function pickQuotes(rows, n = 2) {
  return [...rows]
    .filter((r) => !isNonAnswer(r.text) && r.text.length >= 15 && r.text.length <= 140)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, n);
}

// Answers given to skip the question: "-", "nil", "nothing", "no". No content,
// and they distort every count they are included in.
const NON_ANSWER_RE = /^(nothing|none|nil|nope|no|n\/?a|na|yes|-+|\.+)[.!\s]*$/i;
export const isNonAnswer = (text) => {
  const t = String(text ?? '').trim();
  return t.length < 3 || NON_ANSWER_RE.test(t);
};

// ── action rules ──────────────────────────────────────────────────────────────
// These are optional, generic defaults for turning repeated feedback patterns
// into a starting point for organisers. They are not a playbook for any one
// community; adopters can replace them for their own programme and language.
//
// Rules run against the SURVEY QUESTION, not the sentiment label: "what was
// good" answers feed KEEP, "what could be better" answers feed FIX. The question
// is ground truth; the lexicon label is not (every text_good answer scores
// positive by construction, so filtering on it would be circular).

export const KEEP_RULES = [
  {
    id: 'accessible',
    pair: 'level',
    title: 'Keep the experience accessible to the intended audience',
    action: 'Attendees described the content as clear, approachable, or easy to follow.',
    match: /beginner|no prior|even if (you.?re )?new|even someone|not much technical|simple terms|easy to (understand|digest)|accessible|relatable|role[- ]specific|bite[- ]siz|primer|foundation|intimidat|inclusive|everyone can|any function/,
  },
  {
    id: 'handson',
    pair: 'practice',
    title: 'Keep practical ways for participants to apply the content',
    action: 'Attendees valued exercises, demonstrations, or other applied elements.',
    match: /hands[- ]?on|exercise|practice|\blabs?\b|activity|workshop format|walk[- ]?through|live (demo|code)|worksheet/,
  },
  {
    id: 'examples',
    title: 'Keep using concrete examples',
    action: 'Attendees valued examples, demonstrations, or firsthand stories.',
    match: /real[- ]?life|real[- ]?world|example|use case|case stud|\bdemo|firsthand|first[- ]hand|practical tips/,
  },
  {
    id: 'network',
    title: 'Keep space for participant connection where it adds value',
    action: 'Attendees described meeting and connecting with others as valuable.',
    match: /network|connect(ing|ed)? with|community|meet (new|other)|friend|\bpeers?\b|mingle/,
  },
  {
    id: 'atmosphere',
    title: 'Keep the welcoming atmosphere',
    action: 'Attendees described the experience as friendly, welcoming, or comfortable.',
    match: /casual|relaxed|chill|friendly|welcom|safe|vibe|\bfun\b|intimate|comfortable|not at all forced/,
  },
  {
    id: 'structure',
    pair: 'timing',
    title: 'Keep clear structure and communication',
    action: 'Attendees valued the structure, pacing, or clarity of the experience.',
    match: /structur|pacing|\bpace\b|well[- ]?(organis|organiz|run)|clear agenda|agenda and|well laid out/,
  },
  {
    id: 'speaker',
    title: 'Keep clear, engaging facilitation',
    action: 'Attendees highlighted the speaker, facilitator, or host.',
    match: /speaker|facilitator|facilatator|facilitat|presenter|\bmentor|\bhost\b|story ?telling/,
  },
  {
    id: 'interactive',
    pair: 'engagement',
    title: 'Keep opportunities for participation and discussion',
    action: 'Attendees valued discussion, questions, or interaction.',
    match: /interactive|interaction|\bq&a\b|discussion|quiz|worksheet|group (work|discussion)|participat|asked questions|engaging (demo|discussion|session|conversation)/,
  },
];

export const FIX_RULES = [
  {
    id: 'mentors',
    title: 'Review the availability of support people',
    action: 'Attendees raised mentor or facilitator availability.',
    match: /mentor/,
  },
  {
    id: 'marketing',
    title: 'Review how and when the event is communicated',
    action: 'Attendees raised discoverability, promotion, or timing of communications.',
    match: /marketing|promot|publicis|advertis|more visible|visibility|awareness|getting more people|would have missed|reach more people/,
  },
  {
    id: 'infra',
    title: 'Review venue and technical setup',
    action: 'Attendees raised connectivity, power, or other practical setup needs.',
    match: /wi[- ]?fi|power (plug|socket|outlet)|\bplugs?\b|socket|internet connection|charging/,
  },
  {
    id: 'facilitation',
    title: 'Clarify group logistics and timings',
    action: 'Attendees raised breakout, matching, or session-flow logistics.',
    match: /facilitation (was|of)|breakout|splitting (to|into)|was (a bit )?(confusing|chaotic|messy)|matching session|not clear when/,
  },
  {
    id: 'av',
    title: 'Review audio-visual accessibility',
    action: 'Attendees raised audibility or visibility of the presentation.',
    match: /screen|projector|\bmic\b|microphone|speak louder|\baudio\b|hard to read|not clear in the back|view was (very )?limited|heads kept blocking/,
  },
  {
    id: 'precomms',
    title: 'Improve pre-event information',
    action: 'Attendees raised the information shared before the event.',
    match: /agenda|\bemail\b|registration|confirmation|joining instruction|instructions of the event|in advance|before the (day|session|event)|laptops?\b|qr code|expiration|what time the event|actually start/,
  },
  {
    id: 'materials',
    title: 'Consider follow-up materials',
    action: 'Attendees asked for slides, recordings, links, or other materials.',
    match: /github|source code|learning resources?|send us the slide|share slides?|provide .{0,15}link|slides? presented|recording/,
  },
  {
    id: 'level',
    pair: 'accessible',
    title: 'Clarify the intended experience level',
    action: 'Attendees raised a mismatch between the content level and expectations.',
    match: /beginner|intermediate|advanced|more advance|experienced people|in[- ]?depth|deep ?dive|too basic|for (junior|senior)|skill level|target level|more substantial/,
  },
  {
    id: 'food',
    title: 'Clarify what is provided for participants',
    action: 'Attendees raised refreshments or related expectations.',
    match: /\bfoo+d\b|refreshment|snack|drink|pizza|cheese|dinner|catering/,
  },
  {
    id: 'seating',
    title: 'Review space, seating, and participant comfort',
    action: 'Attendees raised space, seating, or comfort concerns.',
    match: /\bseats?\b|\bseating\b|more tables|tables and seats|more space\b|space (was|is)|venue|\broom\b|crowd|bigger venue|too small|\bhot\b|aircon|standing|noisy|crosstalk/,
  },
  {
    id: 'practice',
    pair: 'handson',
    title: 'Add more opportunities to practise',
    action: 'Attendees asked for more time applying the material.',
    match: /hands[- ]?on|more practical|live demo|code review|on the job|\blabs?\b|practice|walk through/,
  },
  {
    id: 'engagement',
    pair: 'interactive',
    title: 'Create more opportunities for participant input',
    action: 'Attendees asked for more discussion, questions, or interaction.',
    match: /more interactive|more interaction|\bq&a\b|very quiet|ice ?break|round table|breathing space|engaging conversation|panel discussion/,
  },
  {
    id: 'timing',
    pair: 'structure',
    title: 'Review pacing, scope, and timing',
    action: 'Attendees raised the duration, pacing, or start time.',
    match: /\btiming\b|too (short|long|fast|rushed)|went by too quick|felt rushed|a bit rush|more time\b|not enough time|time management|longer|start(ed|ing)? on time|started late|was late|overrun|\bduration\b|more minutes?|watch on time/,
  },
];

// Rank rules by how many comments they match, attaching those comments as
// evidence so every action point can show the answer that produced it.
//
// Each comment is credited to exactly ONE rule: the first that matches, so the
// arrays above are ordered most-specific first. Without this, "the seat was
// uncomfortable and the view was very limited" would raise both a seating and an
// AV action from a single person, and the mention counts would stop meaning
// anything.
export function buildActions(rows, rules, { minHits = 1, max = 3 } = {}) {
  const buckets = new Map<string, any[]>(rules.map((r) => [r.id, []]));
  for (const row of rows) {
    const rule = rules.find((r) => r.match.test(row.text.toLowerCase()));
    if (rule) buckets.get(rule.id).push(row);
  }
  return rules
    .map((rule) => ({ ...rule, hits: buckets.get(rule.id).length, evidence: buckets.get(rule.id) }))
    .filter((x) => x.hits >= minHits)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max);
}

// A small selection needs a lower bar than the whole programme, otherwise a
// nine-comment event can never surface anything and reads as "no issues".
export const minHitsFor = (rows) => (rows.length >= 40 ? 2 : 1);

// The comment that best illustrates a rule. Length is a rough proxy for
// specificity, but only within a readable band: the very longest answers are
// usually multi-topic rambles that illustrate no single point well.
export function bestExample(rows, { min = 15, max = 140 } = {}) {
  const inBand = rows.filter((r) => r.text.length >= min && r.text.length <= max);
  const pool = inBand.length ? inBand : rows.filter((r) => r.text.trim().length >= 8);
  return [...pool].sort((a, b) => b.text.length - a.text.length)[0] ?? null;
}

// A window of a comment centred on the phrase a rule matched. Long answers here
// run to several hundred characters covering half a dozen separate points, so
// quoting the first N characters routinely shows text unrelated to the match and
// makes a correct rule look broken.
export function matchExcerpt(text, re, span = 150) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  const m = flat.toLowerCase().match(re);
  if (!m || flat.length <= span) return { term: m ? m[0] : null, excerpt: flat.slice(0, span) + (flat.length > span ? '…' : '') };
  let start = Math.max(0, m.index - Math.floor((span - m[0].length) / 2));
  let end = Math.min(flat.length, start + span);
  start = Math.max(0, end - span);
  // snap to word boundaries so the window does not open mid-word
  if (start > 0) { const sp = flat.indexOf(' ', start); if (sp > -1 && sp < m.index) start = sp + 1; }
  if (end < flat.length) { const sp = flat.lastIndexOf(' ', end); if (sp > m.index + m[0].length) end = sp; }
  return {
    term: m[0],
    excerpt: (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : ''),
  };
}

// How many comments matched no rule at all. Surfaced in the UI so a reader knows
// the action points are a partial reading of the box, not the whole of it.
export const unmatchedCount = (rows, rules) =>
  rows.filter((r) => !rules.some((x) => x.match.test(r.text.toLowerCase()))).length;
