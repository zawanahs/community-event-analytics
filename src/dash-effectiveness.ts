// Dashboard 1, Event effectiveness
import * as echarts from 'echarts';
import { C, baseAxis, baseTooltip, baseChart, SENTIMENT_COLORS } from './theme';
import { scoped } from './data';
import { kpisEffectiveness, quadrantPoints, quadrantAction, satisfactionVerdict, fmtPct, fmtNum, fmtInt, countBy } from './metrics';
import { isNonAnswer, extractThemes, pickQuotes, buildActions, minHitsFor, unmatchedCount, matchExcerpt, KEEP_RULES, FIX_RULES } from './sentiment';
import { kpiCard, verdictBannerHtml, renderFeedbackBoard, esc } from './components';
import { communityConfig } from './config';
import { canShowFeedback, isDisclosureSafe } from './privacy';

const terms = communityConfig.terminology;
const satisfaction = communityConfig.ratings.satisfaction;

export function initEffectiveness(root, data) {
  root.innerHTML = `
    <div class="kpi-row" id="eff-kpis"></div>

    <h2 class="section-title">Demand × Satisfaction</h2>
    <p class="section-note">
      Each bubble is an event or topic or format (using the toggle). Further right = more registrations than a typical event that year; higher up = better satisfaction scores. Bubble size = number of registrations. The dashed reference lines are medians, splitting the chart into 4 quadrants, each with the proposed action.
      <b>Click a bubble to read that selection's feedback below</b>, click it again to clear.
    </p>
    <div class="card chart-card">
      <div class="toggle-row" id="quad-toggle">
        <button class="toggle-chip active" data-mode="event">By event</button>
        <button class="toggle-chip" data-mode="topic">By topic</button>
        <button class="toggle-chip" data-mode="format">By format</button>
      </div>
      <div class="chart tall" id="quad-chart"></div>
      <div class="table-count" id="quad-note"></div>
    </div>

    <h2 class="section-title">What attendees said</h2>
    <p class="section-note">The verdict is the satisfaction rating attendees gave (${satisfaction.min}–${satisfaction.max}). The themes and comments beneath it come from the free-text answers, grouped by the question asked. Everything in this section follows the bubble you select above.</p>

    <div class="card verdict-card" id="senti-verdict"></div>

    <div class="grid-2">
      <div class="card chart-card span-2">
        <h3>What the feedback says</h3>
        <div class="card-sub">Recurring themes in the comments for the current selection. Directional; read the full board below for context.</div>
        <div id="senti-summary"></div>
      </div>
      <div class="card chart-card span-2">
        <h3>All feedback</h3>
        <div class="card-sub">Every free-text comment for the current selection, grouped by the question asked. Newest events first.</div>
        <div id="fb-table"></div>
      </div>
    </div>`;

  const quadChart = echarts.init(root.querySelector('#quad-chart'));
  let quadMode = 'event';
  let boardFilter = null; // { dim: 'topic'|'format'|'event', id, label }, set by clicking a scatter bubble

  // The scatter is the only entry point to the drill-down: one click rescopes the
  // verdict, the themes and the feedback board together.
  function setBoardFilter(next) {
    boardFilter = next;
    drawQuadrant(); // re-emphasise the selected bubble
    drawVerdict();
    drawSummary();
    drawFeedbackBoard();
  }

  const scopeLabel = () =>
    boardFilter ? `${boardFilter.dim}: ${boardFilter.label}` : 'the current filters';

  quadChart.on('click', (params) => {
    const meta = (params?.data as any)?.meta;
    if (!meta?.id) return;
    const isSame = boardFilter && boardFilter.dim === quadMode && boardFilter.id === meta.id;
    setBoardFilter(isSame ? null : { dim: quadMode, id: meta.id, label: meta.name });
  });
  root.querySelector('#quad-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    quadMode = btn.dataset.mode;
    root.querySelectorAll('#quad-toggle .toggle-chip').forEach((b) => b.classList.toggle('active', b === btn));
    if (boardFilter && boardFilter.dim !== quadMode) setBoardFilter(null);
    else drawQuadrant();
  });
  let slice, annotated;

  function drawKpis() {
    const k = kpisEffectiveness(slice);
    const returningSummary = isDisclosureSafe(k.returningPopulation)
      ? `${fmtPct(k.returningRate)} are returning ${terms.participants}`
      : 'Returning share hidden below the privacy threshold';
    root.querySelector('#eff-kpis').innerHTML = [
      kpiCard(fmtInt(k.uniqueEvents), communityConfig.terminology.events[0].toUpperCase() + communityConfig.terminology.events.slice(1), `unique ${terms.events} in view`),
      kpiCard(fmtNum(k.avgSatisfaction), 'Avg satisfaction', 'mean of survey scores', `/ ${satisfaction.max}`),
      kpiCard(fmtPct(k.responseRate), 'Response rate', `${fmtInt(k.responses)} responses ÷ ${fmtInt(k.totalAttended)} attendees`),
      kpiCard(fmtInt(k.totalRegistered), terms.registrations[0].toUpperCase() + terms.registrations.slice(1), returningSummary),
      kpiCard(k.hotTopic ? esc(k.hotTopic[0]) : '–', 'Hot topic', k.hotTopic ? `${fmtInt(k.hotTopic[1])} attendees` : ''),
    ].join('');
  }

  const isSelected = (meta) => !!boardFilter && boardFilter.dim === quadMode && boardFilter.id === meta.id;

  function drawQuadrant() {
    const { points, skipped } = quadrantPoints(slice, data.satByEvent, quadMode);
    const refs = data.refs;
    const maxDemand = Math.max(1.2, ...points.map((p) => p.demand)) * 1.15;
    const maxReg = Math.max(1, ...points.map((p) => p.registered));

    quadChart.setOption(
      {
        ...baseChart,
        tooltip: {
          ...baseTooltip,
          formatter: (p) => {
            const d = p.data.meta;
            return `<b>${esc(d.name)}</b><br/>${esc(d.detail)}<br/>
              Satisfaction: <b>${fmtNum(d.satisfaction)}</b> / ${satisfaction.max} · Demand index: <b>${fmtNum(d.demand, 2)}</b><br/>
              Suggested action: <b>${quadrantAction(d.satisfaction, d.demand, refs)}</b>`;
          },
        },
        grid: { left: 48, right: 24, top: 36, bottom: 44 },
        xAxis: {
          ...baseAxis, type: 'value', name: 'Demand index (registered ÷ year median)',
          nameLocation: 'middle', nameGap: 28, min: 0, max: +maxDemand.toFixed(1),
        },
        yAxis: {
          ...baseAxis, type: 'value', name: `Satisfaction (${satisfaction.min}–${satisfaction.max})`,
          nameLocation: 'middle', nameGap: 34,
          min: Math.max(0, Math.floor(Math.min(refs.medianSatisfaction, ...points.map((p) => p.satisfaction)) - 1)),
          max: 10,
        },
        series: [{
          type: 'scatter',
          cursor: 'pointer',
          data: points.map((p) => {
            const sel = isSelected(p);
            // bubbles wear their quadrant's action colour (same hues as the corner labels);
            // a selection dims every other bubble so the drilled one is unmistakable
            const color = ACTION_COLORS[quadrantAction(p.satisfaction, p.demand, refs)];
            return {
              value: [p.demand, p.satisfaction],
              name: p.name,
              meta: p,
              itemStyle: {
                color,
                opacity: sel ? 1 : boardFilter ? 0.2 : 0.72,
                borderColor: sel ? C.ink : C.surface,
                borderWidth: sel ? 2.5 : 2,
              },
              label: {
                show: sel || (!boardFilter && (quadMode !== 'event' || points.length <= 14)),
                color: sel ? C.ink : C.ink2,
                fontWeight: sel ? 700 : 400,
              },
            };
          }),
          symbolSize: (v, p) => 10 + 26 * Math.sqrt(p.data.meta.registered / maxReg),
          emphasis: { focus: 'self', itemStyle: { opacity: 1 } },
          label: { show: false, formatter: (p) => p.name, position: 'top', color: C.ink2, fontSize: 10 },
          labelLayout: { hideOverlap: true },
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: C.axis, type: 'dashed', width: 1.5 },
            label: { color: C.muted, fontSize: 10 },
            data: [
              { xAxis: refs.medianDemand, label: { formatter: 'median demand', position: 'insideStartBottom', rotate: 0 } },
              { yAxis: refs.medianSatisfaction, label: { formatter: 'median satisfaction', position: 'insideEndTop' } },
            ],
          },
        }],
        graphic: [
          corner('SCALE', 'high demand, high satisfaction', 'right', 'top', C.green),
          corner('IMPROVE', 'high demand, low satisfaction', 'right', 'bottom', C.jasper),
          corner('MAINTAIN', 'low demand, high satisfaction', 'left', 'top', C.blue),
          corner('DEPRIORITISE', 'low demand, low satisfaction', 'left', 'bottom', C.muted),
        ],
      },
      true,
    );
    root.querySelector('#quad-note').textContent = skipped
      ? `${skipped} event${skipped > 1 ? 's' : ''} without survey responses not plotted.`
      : '';
  }

  const ACTION_COLORS = { Scale: C.green, Improve: C.jasper, Maintain: C.blue, Deprioritise: C.muted };

  // corner label + a small muted caption underneath naming the axes and the action,
  // e.g. "high demand, high satisfaction" under SCALE, so the quadrant reads on its
  // own without the reader needing the paragraph above the chart
  const corner = (action, caption, h, v, color) => ({
    type: 'text',
    [h]: h === 'left' ? 56 : 30, [v]: v === 'top' ? 42 : 52,
    style: {
      text: `{action|${action}}\n{caption|${caption}}`,
      rich: {
        action: { fill: color, fontSize: 11, fontWeight: 700, align: h, lineHeight: 15 },
        caption: { fill: C.muted, fontSize: 9.5, fontWeight: 400, align: h, lineHeight: 13 },
      },
    },
    silent: true,
    z: 5,
  });

  // Headline verdict for the current selection: one word, not a three-way split.
  function drawVerdict() {
    const el = root.querySelector('#senti-verdict');
    const safe = canShowFeedback(boardResponses());
    el.innerHTML = verdictBannerHtml(safe ? satisfactionVerdict(boardResponses()) : null, scopeLabel(), safe);
    const scope = el.querySelector('#verdict-scope');
    if (scope && boardFilter) {
      scope.innerHTML = `<button type="button" class="chip filter-chip board" title="Clear this selection">
          <b>${esc(boardFilter.dim[0].toUpperCase() + boardFilter.dim.slice(1))}:</b> ${esc(boardFilter.label)} <span aria-hidden="true">&times;</span>
        </button>`;
      scope.querySelector('button').addEventListener('click', () => setBoardFilter(null));
    }
  }

  function drawSummary() {
    const rows = boardRows();
    if (!canShowFeedback(rows)) {
      root.querySelector('#senti-summary').innerHTML =
        '<div class="empty-note">Feedback themes and action suggestions are hidden for this selection to protect respondent privacy.</div>';
      return;
    }
    // group by the question asked, not by sentiment label: "what was good"
    // answers are praise by definition, which is the only reliable signal here
    const good = rows.filter((r) => r.question_role === 'positive' && !isNonAnswer(r.text));
    const improve = rows.filter((r) => r.question_role === 'improvement' && !isNonAnswer(r.text));
    const interest = rows.filter((r) => r.question_role === 'topic_request' && !isNonAnswer(r.text));

    const themeChips = (themes) =>
      themes.length
        ? `<div class="theme-chips">${themes.map((t) => `<span class="chip theme">${esc(t.theme)} <b>×${t.count}</b></span>`).join('')}</div>`
        : '<div class="table-count">No recurring themes yet, too few comments.</div>';
    const quoteHtml = (rs) =>
      pickQuotes(rs, 2).map((r) => `<div class="quote">“${esc(r.text)}”</div>`).join('');

    // Each action point carries the comment that produced it, so a director can
    // see exactly what they are acting on rather than trusting a keyword.
    // say plainly how much of the box the rules did not read
    const footnote = (rows, rules) => {
      const n = unmatchedCount(rows, rules);
      return n
        ? `<div class="rec-note">${n} of ${rows.length} comment${rows.length === 1 ? '' : 's'} matched no known theme, read them in the board below.</div>`
        : '';
    };

    // Hovering the count shows the comments the rule actually matched. Without
    // this the reader has no way to check a claim, and a keyword rule that
    // misfires looks exactly like one that did not.
    const evidenceTip = (a) =>
      'Comments behind this:\n' +
      a.evidence
        .slice(0, 6)
        .map((r) => {
          const { term, excerpt } = matchExcerpt(r.text, a.match);
          return `• ${term ? `“${term}”: ` : ''}${excerpt}`;
        })
        .join('\n') +
      (a.evidence.length > 6 ? `\n…and ${a.evidence.length - 6} more` : '');

    // A theme can legitimately appear on both sides: one attendee valued the Q&A,
    // another wanted more of it. Say so, rather than printing "keep X" beside
    // "improve X" and leaving the reader to assume the tool is broken.
    const counterpart = (a, kind) => {
      const other = a.pair && (kind === 'keep' ? fixById : keepById).get(a.pair);
      if (!other) return '';
      const n = other.hits;
      return `<div class="rec-split">Also ${
        kind === 'keep' ? 'raised as something to improve' : 'named as something that worked'
      } (${n} comment${n === 1 ? '' : 's'}), the room was split.</div>`;
    };

    const actionList = (actions, kind) =>
      actions
        .map(
          (a) => `<li class="rec-item">
            <div class="rec-action">${esc(a.title)}
              <span class="rec-hits" title="${esc(evidenceTip(a))}">${a.hits}</span>
            </div>
            <div class="rec-why">${esc(a.action)}</div>
            ${counterpart(a, kind)}
          </li>`,
        )
        .join('') ||
      `<li class="rec-item rec-empty"><div class="rec-why">${
        kind === 'keep'
          ? `No repeated praise theme in this selection yet${good.length ? `, read the ${good.length} comment${good.length === 1 ? '' : 's'} above` : ''}.`
          : improve.length
            ? `${improve.length} suggestion${improve.length === 1 ? '' : 's'} here did not match a known theme, read them in the board below.`
            : 'No improvement suggestions in this selection.'
      }</div></li>`;

    // Rank everything, then show the top few: the full lists are still needed so a
    // theme can be checked against its opposite even when it falls outside the top 3.
    const allKeeps = buildActions(good, KEEP_RULES, { minHits: minHitsFor(good), max: 99 });
    const allFixes = buildActions(improve, FIX_RULES, { minHits: minHitsFor(improve), max: 99 });
    const keeps = allKeeps.slice(0, 3);
    const fixes = allFixes.slice(0, 3);
    const keepById = new Map<string, any>(allKeeps.map((a) => [a.id, a]));
    const fixById = new Map<string, any>(allFixes.map((a) => [a.id, a]));
    // Themes need repetition to mean anything, which one event's handful of
    // answers can never reach, so fall back to quoting the requests themselves.
    const topInterest = extractThemes(interest, 4);
    const rawInterest = topInterest.length
      ? []
      : [...new Set<string>(interest.map((r) => r.text.trim()))].filter((t) => t.length <= 70).slice(0, 4);

    root.querySelector('#senti-summary').innerHTML = `
      <div class="summary-cols">
        <div class="summary-block">
          <h4><span class="dot" style="background:${SENTIMENT_COLORS.positive}"></span> What attendees loved <span class="table-count">(${good.length} comments)</span></h4>
          ${themeChips(extractThemes(good))}
          ${quoteHtml(good)}
        </div>
        <div class="summary-block">
          <h4><span class="dot" style="background:${SENTIMENT_COLORS.negative}"></span> What could be better <span class="table-count">(${improve.length} comments)</span></h4>
          ${themeChips(extractThemes(improve))}
          ${quoteHtml(improve)}
        </div>
      </div>
      <div class="rec-box">
        <h4>What to do about it</h4>
        <div class="rec-groups">
          <div class="rec-group">
            <div class="rec-label keep">Keep doing</div>
            <ul class="rec-list">${actionList(keeps, 'keep')}</ul>
            ${footnote(good, KEEP_RULES)}
          </div>
          <div class="rec-group">
            <div class="rec-label fix">Focus next</div>
            <ul class="rec-list">${actionList(fixes, 'fix')}</ul>
            ${footnote(improve, FIX_RULES)}
          </div>
          <div class="rec-group">
            <div class="rec-label ask">Requested next</div>
            ${
              topInterest.length || rawInterest.length
                ? `<div class="rec-topics">${
                    topInterest.length
                      ? topInterest.map((t) => `<span class="chip theme">${esc(t.theme)} <b>×${t.count}</b></span>`).join('')
                      : rawInterest.map((t) => `<span class="chip theme">${esc(t)}</span>`).join('')
                  }</div>
                  <div class="rec-why">${
                    topInterest.length
                      ? 'Topics that came up repeatedly in the "topic interest" answers.'
                      : `Individual requests, too few here to show a repeating theme.`
                  }</div>`
                : '<div class="rec-why">No topic requests in this selection.</div>'
            }
          </div>
        </div>
      </div>`;
  }

  // the selected bubble scopes both the free-text comments and the rating rows
  function inScope(eventId) {
    if (!boardFilter) return true;
    if (boardFilter.dim === 'event') return eventId === boardFilter.id;
    const ev = data.eventsById.get(eventId);
    return boardFilter.dim === 'topic' ? ev?.topic_primary === boardFilter.id : ev?.format === boardFilter.id;
  }
  const boardRows = () => annotated.filter((r) => inScope(r.event_id));
  const boardResponses = () => slice.responses.filter((r) => inScope(r.event_id));

  function drawFeedbackBoard() {
    renderFeedbackBoard(root.querySelector('#fb-table'), boardRows(), data.eventsById, boardFilter, () => setBoardFilter(null));
  }

  function update() {
    slice = scoped(data);
    annotated = slice.feedback;
    boardFilter = null; // the top filter bar changed scope, drop any chart-click drill-down
    drawKpis();
    drawQuadrant();
    drawVerdict();
    drawSummary();
    drawFeedbackBoard();
  }

  return { update, resize: () => quadChart.resize() };
}
