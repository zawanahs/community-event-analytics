// Shared DOM components: filter bar, KPI cards, sentiment split, feedback table
import { filters, setFilters, parseDate } from './data';
import { SENTIMENT_COLORS } from './theme';
import { FIELD_LABELS, isNonAnswer } from './sentiment';
import { communityConfig } from './config';
import { canShowFeedback } from './privacy';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export { esc };

// ── filter bar ────────────────────────────────────────────────────────────────
export function buildFilterBar(container, data) {
  const formats = [...new Set(data.events.map((e) => e.format).filter(Boolean))].sort();
  const topics = [...new Set(data.events.map((e) => e.topic_primary).filter(Boolean))].sort();

  container.innerHTML = `
    <div class="filterbar-inner">
      <div class="filter-group"><label for="f-format">Format</label><select id="f-format"><option value="">All formats</option>${formats.map((f) => `<option>${esc(f)}</option>`).join('')}</select></div>
      <div class="filter-group"><label for="f-topic">Topic</label><select id="f-topic"><option value="">All topics</option>${topics.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
      <div class="filter-group"><label for="f-event">Event</label><select id="f-event"><option value="">All events</option></select></div>
      <div class="filter-group"><label for="f-from">Period</label>
        <div class="period-inputs">
          <input type="date" id="f-from" aria-label="Period start" />
          <span aria-hidden="true">–</span>
          <input type="date" id="f-to" aria-label="Period end" />
        </div>
      </div>
      <button class="reset-btn" id="f-reset">Reset filters</button>
    </div>
  `;

  const el = (id) => container.querySelector(id);
  const eventSelect = el('#f-event');

  function refreshEventOptions() {
    const opts = data.events
      .filter((e) =>
        (!filters.format || e.format === filters.format) &&
        (!filters.topic || e.topic_primary === filters.topic) &&
        (!filters.from || (e.date && e.date >= filters.from)) &&
        (!filters.to || (e.date && e.date <= filters.to)),
      )
      .sort((a, b) => (a.date && b.date ? b.date - a.date : 0));
    eventSelect.innerHTML =
      '<option value="">All events</option>' +
      opts
        .map((e) => `<option value="${esc(e.event_id)}"${filters.eventId === e.event_id ? ' selected' : ''}>${esc(e.event_name.replace(/_/g, ' '))} (${esc(e.event_date)})</option>`)
        .join('');
  }
  refreshEventOptions();

  el('#f-format').addEventListener('change', (e) => {
    setFilters({ format: e.target.value, eventId: '' });
    refreshEventOptions();
  });
  el('#f-topic').addEventListener('change', (e) => {
    setFilters({ topic: e.target.value, eventId: '' });
    refreshEventOptions();
  });
  eventSelect.addEventListener('change', (e) => setFilters({ eventId: e.target.value }));
  el('#f-from').addEventListener('change', (e) => {
    setFilters({ from: e.target.value ? parseDate(e.target.value) : null, eventId: '' });
    refreshEventOptions();
  });
  el('#f-to').addEventListener('change', (e) => {
    setFilters({ to: e.target.value ? parseDate(e.target.value) : null, eventId: '' });
    refreshEventOptions();
  });
  el('#f-reset').addEventListener('click', () => {
    el('#f-format').value = '';
    el('#f-topic').value = '';
    el('#f-from').value = '';
    el('#f-to').value = '';
    setFilters({ format: '', topic: '', eventId: '', from: null, to: null });
    refreshEventOptions();
  });
}

// ── KPI card ──────────────────────────────────────────────────────────────────
export const kpiCard = (value, label, sub = '', unit = '') => `
  <div class="card kpi">
    <div class="kpi-value">${value}${unit ? `<span class="unit"> ${unit}</span>` : ''}</div>
    <div class="kpi-label">${esc(label)}</div>
    ${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ''}
  </div>`;

// ── sentiment split (stat chips + 100% bar) ───────────────────────────────────
export function sentimentSplitHtml(split, isSafe = true) {
  if (!isSafe) return '<div class="empty-note">Feedback is hidden for this selection to protect respondent privacy.</div>';
  const { counts, share, total } = split;
  if (!total) return '<div class="empty-note">No feedback in this selection</div>';
  const seg = (k) =>
    share[k] > 0 ? `<div style="width:${(share[k] * 100).toFixed(1)}%;background:${SENTIMENT_COLORS[k]}" title="${k}: ${counts[k]}"></div>` : '';
  const stat = (k, name) => `
    <div class="senti-stat"><span class="dot" style="background:${SENTIMENT_COLORS[k]}"></span>
      <b>${(share[k] * 100).toFixed(0)}%</b><span>${name} (${counts[k]})</span></div>`;
  return `
    <div class="senti-row">${stat('positive', 'positive')}${stat('neutral', 'neutral')}${stat('negative', 'negative')}</div>
    <div class="split-bar">${seg('positive')}${seg('neutral')}${seg('negative')}</div>
    <div class="table-count">${total} feedback comments</div>`;
}

// ── overall verdict banner ───────────────────────────────────────────────────
// One verdict from the satisfaction rating, not a three-way sentiment split.
const VERDICT_COPY = {
  positive: { word: 'Positive', gloss: 'Attendees rate these events highly.' },
  neutral: { word: 'Mixed', gloss: 'Ratings are middling, read the themes below before repeating the formula.' },
  negative: { word: 'Negative', gloss: 'Ratings are low, treat the themes below as priorities.' },
};

export function verdictBannerHtml(verdict, scopeLabel, isSafe = true) {
  if (!isSafe) {
    return '<div class="verdict-inner"><div class="empty-note">Feedback is hidden for this selection to protect respondent privacy.</div></div>';
  }
  if (!verdict) {
    return `<div class="verdict-inner"><div class="empty-note">No satisfaction ratings in this selection</div></div>`;
  }
  const copy = VERDICT_COPY[verdict.label];
  const satisfaction = communityConfig.ratings.satisfaction;
  return `
    <div class="verdict-inner">
      <div class="verdict-main">
        <span class="verdict-badge ${verdict.label}"><span class="dot"></span>${copy.word}</span>
        <div class="verdict-copy">
          <div class="verdict-gloss">${esc(copy.gloss)}</div>
          <div class="verdict-meta">
            Average satisfaction <b>${verdict.mean.toFixed(1)} / ${satisfaction.max}</b> across
            ${verdict.total.toLocaleString()} rating${verdict.total === 1 ? '' : 's'} for ${esc(scopeLabel)}
            · ${Math.round(verdict.highShare * 100)}% scored ${satisfaction.verdictPositiveMin} or above.
          </div>
        </div>
      </div>
      <div class="verdict-scope" id="verdict-scope"></div>
    </div>`;
}

// ── feedback board: one column per survey question, active filters in the header ──
const FIELD_ORDER = communityConfig.feedbackRoles.map((role) => role.id);

function activeFilterChips(eventsById) {
  const chips = [];
  if (filters.format) chips.push(['Format', filters.format]);
  if (filters.topic) chips.push(['Topic', filters.topic]);
  if (filters.eventId) chips.push(['Event', eventsById.get(filters.eventId)?.event_name.replace(/_/g, ' ') ?? filters.eventId]);
  const fmtD = (d) => d.toISOString().slice(0, 10);
  if (filters.from || filters.to)
    chips.push(['Period', `${filters.from ? fmtD(filters.from) : '…'} – ${filters.to ? fmtD(filters.to) : '…'}`]);
  if (!chips.length) return '<span class="chip filter-chip all">All events</span>';
  return chips.map(([k, v]) => `<span class="chip filter-chip"><b>${esc(k)}:</b> ${esc(v)}</span>`).join('');
}

export function renderFeedbackBoard(container, rows, eventsById, boardFilter = null, onClearBoardFilter = null) {
  if (!canShowFeedback(rows)) {
    container.innerHTML = '<div class="empty-note">Feedback is hidden for this selection to protect respondent privacy.</div>';
    return;
  }
  const sorted = [...rows].sort((a, b) => {
    const da = eventsById.get(a.event_id)?.date ?? 0;
    const db = eventsById.get(b.event_id)?.date ?? 0;
    return db - da;
  });
  const nonAnswers = sorted.filter((r) => isNonAnswer(r.text)).length;

  const boardChip = boardFilter
    ? `<button type="button" class="chip filter-chip board" title="Clear this filter">
        <b>${esc(boardFilter.dim[0].toUpperCase() + boardFilter.dim.slice(1))}:</b> ${esc(boardFilter.label)} <span aria-hidden="true">&times;</span>
      </button>`
    : '';

  container.innerHTML = `
    <div class="fb-context">
      <div class="fb-context-chips">Showing ${activeFilterChips(eventsById)}${boardChip}</div>
      <label class="fb-toggle"${nonAnswers ? '' : ' hidden'}>
        <input type="checkbox" checked />
        Hide non-answers <span class="table-count">(${nonAnswers})</span>
      </label>
      <input type="search" placeholder="Search feedback…" aria-label="Search feedback" />
      <span class="table-count"></span>
    </div>
    <div class="fb-board">
      ${FIELD_ORDER.map((f) => `
        <section class="fb-col" data-field="${f}">
          <header class="fb-col-head">
            <h4>${esc(FIELD_LABELS[f])}</h4>
            <div class="fb-col-overall"></div>
          </header>
          <div class="fb-col-list"></div>
        </section>`).join('')}
    </div>`;

  const count = container.querySelector('.table-count');
  const search = container.querySelector('input[type=search]');
  const hideToggle = container.querySelector('.fb-toggle input');

  function draw() {
    const needle = search.value.trim().toLowerCase();
    const hideNon = hideToggle.checked;
    const kept = hideNon ? sorted.filter((r) => !isNonAnswer(r.text)) : sorted;
    const visible = needle
      ? kept.filter((r) => r.text.toLowerCase().includes(needle) || r.event_id.toLowerCase().includes(needle))
      : kept;
    count.textContent = `${visible.length} of ${sorted.length} comments`;

    for (const field of FIELD_ORDER) {
      const col = container.querySelector(`.fb-col[data-field="${field}"]`);
      const colRows = visible.filter((r) => r.question_role === field);
      const colTotal = sorted.filter((r) => r.question_role === field).length;

      // the header counts, no sentiment verdict: "What was good" is positive by
      // construction, so a chip there would only restate the column name
      col.querySelector('.fb-col-overall').innerHTML =
        `<span class="table-count">${colRows.length}${colRows.length === colTotal ? '' : ` of ${colTotal}`}</span>`;

      col.querySelector('.fb-col-list').innerHTML = colRows.length
        ? colRows
            .slice(0, 300)
            .map((r) => {
              const ev = eventsById.get(r.event_id);
              return `<div class="fb-item">
                <div class="fb-item-text">${esc(r.text)}</div>
                <div class="fb-item-meta">${esc(ev?.event_name.replace(/_/g, ' ') ?? r.event_id)} · ${esc(ev?.event_date ?? '')}</div>
              </div>`;
            })
            .join('')
        : '<div class="empty-note">No comments</div>';
    }
  }
  if (boardFilter && onClearBoardFilter) {
    container.querySelector('.chip.filter-chip.board').addEventListener('click', onClearBoardFilter);
  }
  search.addEventListener('input', draw);
  hideToggle.addEventListener('change', draw);
  draw();
}
