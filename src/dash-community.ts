// Dashboard 2, Community profile
import * as echarts from 'echarts';
import { C, baseAxis, baseTooltip, baseChart, GENDER_ORDER, GENDER_COLORS, SECTOR_ORDER, SECTOR_COLORS, SEQ_BLUE } from './theme';
import { scoped } from './data';
import {
  kpisCommunity, fmtPct, fmtNum, fmtInt, YOE_ORDER, SURVEY_YOE_ORDER,
  outcomeByYoe, distributionByYoe, returningBySegment,
} from './metrics';
import { annotateFeedback, sentimentSplit } from './sentiment';
import { kpiCard, sentimentSplitHtml, renderFeedbackBoard, esc } from './components';
import { communityConfig } from './config';
import { canShowFeedback, disclosureGroups, isDisclosureSafe, minimumSegmentSize, protectedCrossTab } from './privacy';

const ORG_NOISE = new Set(['other', 'na', 'n/a', '-', 'nil', 'unknown', 'none', '']);

const excludedOrganisations = new Set(communityConfig.privacy.excludedOrganisations.map((name) => name.toLowerCase()));
const segmentValue = (row, id) => {
  const segment = communityConfig.segments[id];
  return row[segment.registrationField] ?? segment.unknownLabel;
};
const isCommunityStaff = (r) => excludedOrganisations.has(String(segmentValue(r, 'organization')).trim().toLowerCase());
const experienceOf = (r) => segmentValue(r, 'experience');
const genderOf = (r) => segmentValue(r, 'gender');
const sectorOf = (r) => segmentValue(r, 'sector');
const jobFamilyOf = (r) => segmentValue(r, 'jobFamily');
const organizationOf = (r) => segmentValue(r, 'organization');
const participantIdOf = (r) => r.participant_id;
const terms = communityConfig.terminology;
const segments = communityConfig.segments;
const satisfaction = communityConfig.ratings.satisfaction;
const recommendation = communityConfig.ratings.recommendation;

export function initCommunity(root, data) {
  root.innerHTML = `
    <div class="kpi-row" id="comm-kpis"></div>

    <h2 class="section-title">Who we're reaching</h2>
    <p class="section-note" id="comm-coverage">Participant attributes for the current filters.</p>
    <div class="grid-2">
      <div class="card chart-card">
        <h3>${esc(segments.experience.label)}</h3>
        <div class="card-sub">Ordered by configured category order, split by ${esc(segments.gender.shortLabel.toLowerCase())}.</div>
        <div class="chart short" id="yoe-chart"></div>
      </div>
      <div class="card chart-card">
        <h3>${esc(segments.gender.label)} mix by topic</h3>
        <div class="card-sub">How topics differ by ${esc(segments.gender.shortLabel.toLowerCase())}, as a share of ${esc(terms.registrations)}.</div>
        <div class="chart short" id="topic-gender-chart"></div>
      </div>
      <div class="card chart-card">
        <h3>${esc(segments.jobFamily.label)}</h3>
        <div class="card-sub">Configured participant categories. Area = number of ${esc(terms.registrations)}.</div>
        <div class="chart" id="jobfam-chart"></div>
      </div>
      <div class="card chart-card">
        <h3>${esc(segments.sector.label)}</h3>
        <div class="card-sub">Reported at registration, as a share of all ${esc(terms.registrations)}.</div>
        <div class="chart" id="sector-chart" style="height:120px"></div>
        <div id="sector-legend"></div>
      </div>
    </div>

    <h2 class="section-title">Segment × outcome</h2>
    <p class="section-note" id="seg-note"></p>
    <div class="card chart-card">
      <div class="seg-controls">
        <div class="toggle-group"><span class="toggle-group-label">Segment</span>
          <div class="toggle-row" id="seg-toggle">
            <button class="toggle-chip active" data-dim="yoe">${esc(segments.experience.shortLabel)}</button>
            <button class="toggle-chip" data-dim="gender">${esc(segments.gender.shortLabel)}</button>
            <button class="toggle-chip" data-dim="jobfam">${esc(segments.jobFamily.shortLabel)}</button>
            <button class="toggle-chip" data-dim="sector">${esc(segments.sector.shortLabel)}</button>
            <button class="toggle-chip" data-dim="org">${esc(segments.organization.shortLabel)}</button>
          </div>
        </div>
        <div class="toggle-group"><span class="toggle-group-label">Outcome</span>
          <div class="toggle-row" id="outcome-toggle">
            <button class="toggle-chip active" data-out="return">Returning rate</button>
            <button class="toggle-chip" data-out="sat">Satisfaction mix</button>
            <button class="toggle-chip" data-out="rec">Recommend score</button>
          </div>
        </div>
      </div>
      <div class="chart" id="seg-chart"></div>
    <div class="table-count" id="seg-hint">Small segments are hidden according to the configured privacy threshold.</div>
    </div>
    <div class="grid-2">
      <div class="card chart-card span-2" id="seg-fb-card" hidden>
        <div class="seg-fb-head">
          <h3>Survey feedback from <span id="seg-sel-label"></span></h3>
          <button class="clear-btn" id="seg-clear" aria-label="Clear segment selection">✕ Clear</button>
        </div>
        <div class="card-sub">Free-text answers from responses in this experience bracket only. Directly attributed, nothing inferred.</div>
        <div id="seg-senti"></div>
        <div id="seg-fb-table"></div>
      </div>
    </div>`;

  const yoeChart = echarts.init(root.querySelector('#yoe-chart'));
  const topicGenderChart = echarts.init(root.querySelector('#topic-gender-chart'));
  const jobfamChart = echarts.init(root.querySelector('#jobfam-chart'));
  const sectorChart = echarts.init(root.querySelector('#sector-chart'));
  const segChart = echarts.init(root.querySelector('#seg-chart'));
  const donutEl = () => root.querySelector('#gender-donut');
  let donutChart = null;

  let segDim = 'yoe';
  let segOutcome = 'return';
  let segSelection = null; // { dim, bucket, responseLevel }
  let slice, annotated;

  const responseSegmentLabel = segments.experience.label;
  // Survey outcomes are attributable only to the response-level segment configured by this version.
  const validCombo = (dim, out) => out === 'return' || dim === 'yoe';

  function refreshChipStates() {
    root.querySelectorAll('#seg-toggle .toggle-chip').forEach((b) => {
      const off = !validCombo(b.dataset.dim, segOutcome);
      b.classList.toggle('disabled', off);
      b.title = off ? `The survey only records ${responseSegmentLabel.toLowerCase()}; pick Returning rate to use this segment` : '';
    });
    root.querySelectorAll('#outcome-toggle .toggle-chip').forEach((b) => {
      const off = !validCombo(segDim, b.dataset.out);
      b.classList.toggle('disabled', off);
      b.title = off ? `Survey answers can only be attributed by ${responseSegmentLabel.toLowerCase()}` : '';
    });
  }

  root.querySelector('#seg-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dim]');
    if (!btn || btn.classList.contains('disabled')) return;
    segDim = btn.dataset.dim;
    segSelection = null;
    root.querySelectorAll('#seg-toggle .toggle-chip').forEach((b) => b.classList.toggle('active', b === btn));
    drawSegment();
    drawSegmentFeedback();
  });
  root.querySelector('#outcome-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-out]');
    if (!btn || btn.classList.contains('disabled')) return;
    segOutcome = btn.dataset.out;
    segSelection = null;
    root.querySelectorAll('#outcome-toggle .toggle-chip').forEach((b) => b.classList.toggle('active', b === btn));
    drawSegment();
    drawSegmentFeedback();
  });

  // feedback drill-down only where it's directly attributable: survey outcomes carry
  // years_exp on each response, everything else is anonymous, so no feedback opens
  const canDrill = () => segDim === 'yoe' && segOutcome !== 'return';

  segChart.on('click', (p) => {
    if (!canDrill()) return;
    const row = segmentRows().find((candidate) => candidate.bucket === p.name);
    if (!row || !isDisclosureSafe(row.n)) return;
    segSelection = { bucket: p.name };
    drawSegmentFeedback();
  });
  root.querySelector('#seg-clear').addEventListener('click', () => {
    segSelection = null;
    drawSegmentFeedback();
  });

  function drawKpis() {
    const k = kpisCommunity(slice);
    const gender = disclosureGroups(slice.registrations, genderOf, participantIdOf);
    const safeGender = !gender.hasUnsafeRemainder && gender.groups.length > 0;
    const safeSectors = disclosureGroups(slice.registrations, sectorOf, participantIdOf);
    const topSector = !safeSectors.hasUnsafeRemainder
      ? [...safeSectors.groups].sort((a, b) => b.count - a.count)[0] ?? null
      : null;
    const genderTotal = gender.groups.reduce((total, group) => total + group.count, 0) || 1;
    const safePeople = isDisclosureSafe(k.uniquePeople);
    const safeReturning = isDisclosureSafe(k.returningPopulation);
    root.querySelector('#comm-kpis').innerHTML = [
      kpiCard(safePeople ? fmtInt(k.uniquePeople) : 'Hidden', `Unique ${terms.participants}`, safePeople ? 'distinct de-identified participant keys' : 'Selection is below the privacy threshold'),
      `<div class="card kpi"><div class="kpi-label" style="margin-top:0">${esc(segments.gender.label)} mix</div>${safeGender ? '<div id="gender-donut" style="height:110px"></div>' : '<div class="empty-note">Hidden to protect privacy</div>'}</div>`,
      kpiCard(safeReturning ? fmtPct(k.returningRate) : 'Hidden', 'Returning rate', safeReturning ? `share of ${terms.participants} who registered for another ${terms.event}` : 'Selection is below the privacy threshold'),
      kpiCard(topSector ? esc(topSector.key) : 'Hidden', `Largest ${segments.sector.shortLabel.toLowerCase()}`, topSector ? `${fmtInt(topSector.count)} ${terms.registrations}` : 'Segment totals would reveal a small group'),
    ].join('');

    donutChart?.dispose();
    if (!safeGender) return;
    donutChart = echarts.init(donutEl());
    const gData = gender.groups.map((group) => ({
      name: group.key, value: group.count, itemStyle: { color: GENDER_COLORS[group.key] ?? C.notStated },
    }));
    donutChart.setOption({
      ...baseChart,
      tooltip: { ...baseTooltip, formatter: (p) => `${esc(p.name)}: <b>${fmtInt(p.value)}</b> (${p.percent}%)` },
      series: [{
        type: 'pie', radius: ['58%', '85%'], center: ['30%', '50%'],
        itemStyle: { borderColor: C.card, borderWidth: 2 },
        label: { show: false },
        data: gData,
      }],
      legend: {
        orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 10,
        textStyle: { color: C.ink2, fontSize: 11 },
        formatter: (name) => `${name} ${((gData.find((item) => item.name === name)?.value / genderTotal) * 100).toFixed(0)}%`,
      },
    });
  }

  const stackedGenderSeries = (buckets, tab) => {
    const genderKeys: string[] = Array.from(new Set<string>(buckets.flatMap((b) => (tab.get(b)?.children.map((child) => child.key) ?? []) as string[])));
    return genderKeys.sort((a, b) =>
      ((GENDER_ORDER as readonly string[]).indexOf(a) === -1 ? 99 : (GENDER_ORDER as readonly string[]).indexOf(a)) - ((GENDER_ORDER as readonly string[]).indexOf(b) === -1 ? 99 : (GENDER_ORDER as readonly string[]).indexOf(b)),
    ).map((g) => ({
      name: g, type: 'bar', stack: 'g', barMaxWidth: 22,
      itemStyle: { color: (GENDER_COLORS as Record<string, string>)[g] ?? C.notStated, borderColor: C.card, borderWidth: 1 },
      data: buckets.map((b) => tab.get(b)?.children.find((child) => child.key === g)?.count ?? 0),
    }));
  };

  const hideChart = (chart, message) => chart.setOption({
    ...baseChart,
    xAxis: { show: false }, yAxis: { show: false }, series: [],
    graphic: [{ type: 'text', left: 'center', top: 'middle', style: { text: message, fill: C.muted, fontSize: 12 } }],
  }, true);

  function drawYoe() {
    const groups = protectedCrossTab(slice.registrations, experienceOf, genderOf, participantIdOf);
    const tab = new Map(groups.map((group) => [group.key, group]));
    const buckets = YOE_ORDER.filter((b) => tab.has(b));
    if (!buckets.length) return hideChart(yoeChart, 'No privacy-safe segments for this selection.');
    yoeChart.setOption({
      ...baseChart,
      tooltip: {
        ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => {
          const total = ps.reduce((s, p) => s + p.value, 0);
          return `<b>${esc(ps[0].name)}</b> · ${fmtInt(total)} ${terms.registrations}<br/>` +
            ps.filter((p) => p.value).map((p) => `${p.marker} ${esc(p.seriesName)}: ${fmtInt(p.value)}`).join('<br/>');
        },
      },
      legend: { bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2, fontSize: 11 } },
      grid: { left: 8, right: 30, top: 8, bottom: 28, containLabel: true },
      xAxis: { ...baseAxis, type: 'value' },
      yAxis: { ...baseAxis, type: 'category', inverse: true, data: buckets, splitLine: { show: false } },
      series: stackedGenderSeries(buckets, tab),
    }, true);
  }

  function drawTopicGender() {
    const groups = protectedCrossTab(slice.registrations, (r) => data.eventsById.get(r.event_id)?.topic_primary ?? 'Not stated', genderOf, participantIdOf);
    const tab = new Map(groups.map((group) => [group.key, group]));
    const topics = [...tab.keys()].sort((a, b) => {
      const tot = (t) => tab.get(t).count;
      return tot(b) - tot(a);
    });
    if (!topics.length) return hideChart(topicGenderChart, 'No privacy-safe segments for this selection.');
    const totals = topics.map((t) => tab.get(t).count);
    const genders = [...new Set(topics.flatMap((t) => tab.get(t)?.children.map((child) => child.key) ?? []))];
    const series = genders.map((g) => ({
      name: g, type: 'bar', stack: 'g', barMaxWidth: 18,
      itemStyle: { color: (GENDER_COLORS as Record<string, string>)[g] ?? C.notStated, borderColor: C.card, borderWidth: 1 },
      label: {
        show: true, color: '#fff', fontSize: 10,
        formatter: (p) => (p.value >= 15 ? `${Math.round(p.value)}%` : ''),
      },
      data: topics.map((t, i) => +(((tab.get(t)?.children.find((child) => child.key === g)?.count ?? 0) / totals[i]) * 100).toFixed(1)),
    }));
    topicGenderChart.setOption({
      ...baseChart,
      tooltip: {
        ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => `<b>${esc(ps[0].name)}</b> · ${fmtInt(totals[ps[0].dataIndex])} ${terms.registrations}<br/>` +
          ps.filter((p) => p.value).map((p) => `${p.marker} ${esc(p.seriesName)}: ${Math.round(p.value)}%`).join('<br/>'),
      },
      legend: { bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2, fontSize: 11 } },
      grid: { left: 8, right: 16, top: 8, bottom: 28, containLabel: true },
      xAxis: { ...baseAxis, type: 'value', max: 100, axisLabel: { ...baseAxis.axisLabel, formatter: '{value}%' } },
      yAxis: {
        ...baseAxis, type: 'category', inverse: true, data: topics, splitLine: { show: false },
        axisLabel: { ...baseAxis.axisLabel, width: 110, overflow: 'truncate' },
      },
      series,
    }, true);
  }

  function drawJobFamilies() {
    const protectedGroups = disclosureGroups(slice.registrations, jobFamilyOf, participantIdOf);
    if (protectedGroups.hasUnsafeRemainder) return hideChart(jobfamChart, 'Hidden because a total could reveal a small group.');
    const total = protectedGroups.groups.reduce((sum, group) => sum + group.count, 0) || 1;
    const items = protectedGroups.groups.sort((a, b) => b.count - a.count);
    jobfamChart.setOption({
      ...baseChart,
      tooltip: { ...baseTooltip, formatter: (p) => `<b>${esc(p.name)}</b><br/>${fmtInt(p.value)} ${terms.registrations} (${fmtPct(p.value / total)})` },
      series: [{
        type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
        left: 0, right: 0, top: 0, bottom: 0,
        visualMin: 0, visualMax: items[0]?.count ?? 1,
        label: {
          color: '#fff', fontSize: 11, fontWeight: 600,
          formatter: (p) => `${p.name}\n${fmtInt(p.value)} · ${fmtPct(p.value / total)}`,
        },
        levels: [{
          color: SEQ_BLUE.slice(3), // light -> dark so the biggest family reads darkest, white labels stay legible
          colorMappingBy: 'value',
          itemStyle: { borderColor: C.card, borderWidth: 2, gapWidth: 2 },
        }],
        data: items.map((group) => ({ name: group.key, value: group.count })),
      }],
    }, true);
  }

  function drawSector() {
    const protectedGroups = disclosureGroups(slice.registrations, sectorOf, participantIdOf);
    if (protectedGroups.hasUnsafeRemainder) {
      hideChart(sectorChart, 'Hidden because a total could reveal a small group.');
      root.querySelector('#sector-legend').innerHTML = '';
      return;
    }
    const counts = new Map(protectedGroups.groups.map((group) => [group.key, group.count]));
    const total = protectedGroups.groups.reduce((sum, group) => sum + group.count, 0) || 1;
    const sectors = [...counts.keys()].sort((a, b) => ((SECTOR_ORDER as readonly string[]).indexOf(a) === -1 ? 99 : (SECTOR_ORDER as readonly string[]).indexOf(a)) - ((SECTOR_ORDER as readonly string[]).indexOf(b) === -1 ? 99 : (SECTOR_ORDER as readonly string[]).indexOf(b)));
    sectorChart.setOption({
      ...baseChart,
      tooltip: {
        ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (ps) => ps.filter((p) => p.value).map((p) => `${p.marker} ${esc(p.seriesName)}: <b>${fmtInt(counts.get(p.seriesName))}</b> (${Math.round(p.value)}%)`).join('<br/>'),
      },
      grid: { left: 8, right: 60, top: 6, bottom: 6, containLabel: true },
      xAxis: { ...baseAxis, type: 'value', max: 100, show: false },
      yAxis: { ...baseAxis, type: 'category', data: ['All'], show: false },
      series: sectors.map((s) => ({
        name: s, type: 'bar', stack: 's', barMaxWidth: 34,
        itemStyle: { color: SECTOR_COLORS[s], borderColor: C.card, borderWidth: 1 },
        label: { show: true, color: '#fff', fontSize: 10, formatter: (p) => (p.value >= 9 ? `${Math.round(p.value)}%` : '') },
        data: [+(((counts.get(s) ?? 0) / total) * 100).toFixed(1)],
      })),
    }, true);
    root.querySelector('#sector-legend').innerHTML =
      `<div class="senti-row" style="gap:12px">` +
      sectors.map((s) => `<div class="senti-stat"><span class="dot" style="background:${SECTOR_COLORS[s]}"></span><span>${esc(s)} · ${fmtInt(counts.get(s))}</span></div>`).join('') +
      `</div><div class="table-count">${fmtInt(total)} ${terms.registrations}</div>`;
  }

  // ── segment × outcome ──────────────────────────────────────────────────────
  const MIN_N = minimumSegmentSize();
  const DIM_LABELS = {
    yoe: segments.experience.label.toLowerCase(),
    gender: segments.gender.label.toLowerCase(),
    jobfam: segments.jobFamily.label.toLowerCase(),
    sector: segments.sector.label.toLowerCase(),
    org: segments.organization.label.toLowerCase(),
  };

  const segKeyFn = () =>
    segDim === 'gender' ? genderOf
    : segDim === 'jobfam' ? jobFamilyOf
    : segDim === 'sector' ? sectorOf
    : segDim === 'org' ? organizationOf
    : experienceOf; // experience on registrant data (returning-rate view)

  // YOE stays in career order (it's ordinal, the progression is the point); every
  // other dim ranks by the outcome, best at the top. For org/jobfam keep the 12
  // biggest groups (by n) before ranking so a tiny group can't crowd out a big one.
  function orderRows(rows) {
    if (segDim === 'yoe') {
      const order = segOutcome === 'return' ? YOE_ORDER : SURVEY_YOE_ORDER;
      return order.filter((b) => rows.some((r) => r.bucket === b)).map((b) => rows.find((r) => r.bucket === b));
    }
    if (segDim === 'org') rows = rows.filter((r) => !ORG_NOISE.has(r.bucket.toLowerCase()) && r.n >= 4);
    rows.sort((a, b) => b.n - a.n);
    rows = rows.slice(0, 12);
    const metric =
      segOutcome === 'return' ? (r) => r.rate ?? 0
      : segOutcome === 'sat' ? (r) => r.promoters / (r.n || 1)
      : (r) => r.avg;
    rows.sort((a, b) => metric(b) - metric(a));
    return rows;
  }

  function segmentRows() {
    if (segOutcome === 'return') return orderRows(returningBySegment(slice, segKeyFn()).filter((row) => isDisclosureSafe(row.n)));
    // survey outcomes: years-of-experience only, the one attribute responses carry
    return orderRows((segOutcome === 'sat' ? distributionByYoe(slice) : outcomeByYoe(slice, 'recommend')).filter((row) => isDisclosureSafe(row.n)));
  }

  function segNote() {
    const dim = `<b>${DIM_LABELS[segDim]}</b>`;
    const surveyNote = ` Computed directly from survey responses; the survey records ${responseSegmentLabel.toLowerCase()} only, so other segment cuts are unavailable for this outcome.`;
    if (segOutcome === 'return')
      return `Share of each segment's ${terms.participants} who registered for 2+ ${terms.events}, by ${dim}.`;
    if (segOutcome === 'sat')
      return `Satisfaction mix by ${dim}: promoters scored ${satisfaction.promoterMin}–${satisfaction.max}, passives ${satisfaction.passiveMin}–${satisfaction.promoterMin - 1}, detractors ${satisfaction.passiveMin - 1} or below.` + surveyNote;
    return `Average "would you recommend" score by ${dim}, shown as the gap vs the overall average.` + surveyNote;
  }

  // Horizontal layout: with up to 12 long category names, rows never collide the way
  // rotated/wrapped x-axis labels do, each segment owns a row, n= rides on the bar label.
  function drawSegment() {
    refreshChipStates();
    const rows = segmentRows();
    root.querySelector('#seg-note').innerHTML = segNote();
    root.querySelector('#seg-hint').innerHTML = canDrill()
      ? `Only segments with at least ${MIN_N} responses are shown. Click a bar to read that group’s survey feedback below.`
      : `Only segments with at least ${MIN_N} people or responses are shown. Survey responses are anonymous, so feedback opens only for survey outcomes by ${esc(responseSegmentLabel.toLowerCase())}.`;

    if (!rows.length) return hideChart(segChart, 'No privacy-safe segments for this selection.');

    const base = {
      ...baseChart,
      grid: { left: 8, right: 90, top: 12, bottom: 30, containLabel: true },
      yAxis: {
        ...baseAxis, type: 'category', inverse: true, data: rows.map((r) => r.bucket),
        splitLine: { show: false },
        axisLabel: { ...baseAxis.axisLabel, interval: 0, width: 120, overflow: 'truncate' },
      },
    };
    const valueAxisName = (name) => ({ name, nameLocation: 'middle', nameGap: 24 });

    if (segOutcome === 'return') {
      segChart.setOption({
        ...base,
        tooltip: {
          ...baseTooltip,
          formatter: (p) => {
            const r = rows[p.dataIndex];
            return `<b>${esc(r.bucket)}</b><br/>Returning: <b>${fmtPct(r.rate)}</b> of ${fmtInt(r.n)} people`;
          },
        },
        xAxis: {
          ...baseAxis, type: 'value', ...valueAxisName('Returning %'),
          axisLabel: { ...baseAxis.axisLabel, formatter: '{value}%' },
        },
        series: [{
          type: 'bar', barMaxWidth: 26,
          itemStyle: { color: C.green, borderRadius: [0, 4, 4, 0] },
          label: {
            show: true, position: 'right', color: C.ink2, fontSize: 11,
            formatter: (p) => `${Math.round(p.value)}% {n|· n=${fmtInt(rows[p.dataIndex].n)}}`,
            rich: { n: { color: C.muted, fontSize: 10 } },
          },
          data: rows.map((r) => +((r.rate ?? 0) * 100).toFixed(1)),
        }],
      }, true);
      return;
    }

    if (segOutcome === 'sat') {
      // per-row shares normalised to sum to exactly 100, so the stack never
      // overshoots the axis and gets its end label clipped
      const shares = rows.map((r) => {
        const pa = +((r.passives / (r.n || 1)) * 100).toFixed(1);
        const d = +((r.detractors / (r.n || 1)) * 100).toFixed(1);
        return { promoters: +(100 - pa - d).toFixed(1), passives: pa, detractors: d };
      });
      const mk = (key, name, color) => ({
        name, type: 'bar', stack: 'd', barMaxWidth: 26,
        itemStyle: { color, borderColor: C.card, borderWidth: 1 },
        label: { show: true, color: '#fff', fontSize: 10, formatter: (p) => (p.value >= 12 ? `${Math.round(p.value)}%` : '') },
        data: rows.map((r, i) => ({
          value: shares[i][key],
        })),
      });
      // invisible stack cap that carries the n= label past the 100% mark
      const nCap = {
        name: '__n', type: 'bar', stack: 'd', silent: true, itemStyle: { color: 'transparent' },
        label: {
          show: true, position: 'right', color: C.muted, fontSize: 10,
          formatter: (p) => `n=${fmtInt(rows[p.dataIndex].n)}`,
        },
        data: rows.map(() => 0),
      };
      segChart.setOption({
        ...base,
        tooltip: {
          ...baseTooltip, trigger: 'axis', axisPointer: { type: 'shadow' },
          formatter: (ps) => {
            const r = rows[ps[0].dataIndex];
            return `<b>${esc(r.bucket)}</b> · n=${fmtInt(r.n)} responses<br/>` +
              ps.filter((p) => p.seriesName !== '__n').map((p) => `${p.marker} ${p.seriesName}: ${Math.round(p.value)}%`).join('<br/>');
          },
        },
        legend: {
          bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { color: C.ink2, fontSize: 11 },
          data: [`Promoters (${satisfaction.promoterMin}–${satisfaction.max})`, `Passives (${satisfaction.passiveMin}–${satisfaction.promoterMin - 1})`, `Detractors (≤${satisfaction.passiveMin - 1})`],
        },
        grid: { ...base.grid, bottom: 46 },
        xAxis: {
          ...baseAxis, type: 'value', max: 100, ...valueAxisName('Share of responses'),
          axisLabel: { ...baseAxis.axisLabel, formatter: '{value}%' },
        },
        series: [
          mk('promoters', `Promoters (${satisfaction.promoterMin}–${satisfaction.max})`, C.green),
          mk('passives', `Passives (${satisfaction.passiveMin}–${satisfaction.promoterMin - 1})`, C.muted),
          mk('detractors', `Detractors (≤${satisfaction.passiveMin - 1})`, C.jasper),
          nCap,
        ],
      }, true);
      return;
    }

    // recommend: deviation from the overall average, so small differences stay legible
    const totalN = rows.reduce((s, r) => s + r.n, 0);
    const overall = totalN ? rows.reduce((s, r) => s + r.avg * r.n, 0) / totalN : 0;
    const maxAbs = Math.max(0.3, ...rows.map((r) => Math.abs(r.avg - overall))) * 1.35;
    segChart.setOption({
      ...base,
      tooltip: {
        ...baseTooltip,
        formatter: (p) => {
          const r = rows[p.dataIndex];
          return `<b>${esc(r.bucket)}</b><br/>Avg recommend: <b>${fmtNum(r.avg)}</b> / ${recommendation.max} (overall ${fmtNum(overall)})<br/>` +
            `n=${fmtInt(r.n)} responses`;
        },
      },
      xAxis: {
        ...baseAxis, type: 'value', min: -maxAbs, max: maxAbs,
        ...valueAxisName(`Δ vs overall recommend (${fmtNum(overall)})`),
        axisLabel: { ...baseAxis.axisLabel, formatter: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) },
      },
      series: [{
        type: 'bar', barMaxWidth: 26,
        itemStyle: {
          color: (p) => (rows[p.dataIndex].avg >= overall ? C.green : C.jasper),
          borderRadius: 4,
        },
        data: rows.map((r) => ({
          value: +(r.avg - overall).toFixed(2),
          label: {
            show: true, position: r.avg >= overall ? 'right' : 'left', color: C.ink2, fontSize: 11,
            formatter: () => `${fmtNum(r.avg)} {n|· n=${fmtInt(r.n)}}`,
            rich: { n: { color: C.muted, fontSize: 10 } },
          },
        })),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: C.axis }, label: { show: false }, data: [{ xAxis: 0 }] },
      }],
    }, true);
  }

  function drawSegmentFeedback() {
    const card = root.querySelector('#seg-fb-card');
    if (!segSelection || !canDrill()) {
      card.hidden = true;
      return;
    }
    const ids = new Set(slice.responses.filter((r) => (r.experience_segment ?? 'Not stated') === segSelection.bucket).map((r) => r.response_id));
    const rows = annotated.filter((r) => ids.has(r.response_id));
    card.hidden = false;
    root.querySelector('#seg-sel-label').textContent = segSelection.bucket;
    const safe = canShowFeedback(rows);
    root.querySelector('#seg-senti').innerHTML = sentimentSplitHtml(sentimentSplit(rows), safe);
    renderFeedbackBoard(root.querySelector('#seg-fb-table'), rows, data.eventsById);
  }

  function update() {
    const full = scoped(data);
    slice = { ...full, registrations: full.registrations.filter((r) => !isCommunityStaff(r)) };
    annotated = annotateFeedback(slice.feedback);
    segSelection = null;
    const covered = new Set(slice.registrations.map((r) => r.event_id)).size;
    root.querySelector('#comm-coverage').textContent =
      `Participant attributes for the current filters. Configured team registrations are excluded. Participant-level data covers ${covered} of ${slice.events.length} ${terms.events} in view.`;
    drawKpis();
    drawYoe();
    drawTopicGender();
    drawJobFamilies();
    drawSector();
    drawSegment();
    drawSegmentFeedback();
  }

  return {
    update,
    resize: () => [yoeChart, topicGenderChart, jobfamChart, sectorChart, segChart, donutChart].forEach((c) => c?.resize()),
  };
}
