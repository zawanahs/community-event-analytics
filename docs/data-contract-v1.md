# Community Event Analytics data contract v1

Status: normative contract for the generic product. Known conformance gaps are listed at the end of this document.

This contract defines the canonical data model consumed by Community Event Analytics. Source adapters may read Google Sheets, CSV files, APIs, or bundled sample data, but they must normalize their input to this model before metrics or charts use it.

## Product scope and terminology

The product helps an event-organizing community answer two questions:

1. **Programme effectiveness:** Which events, topics, and formats attract demand and produce positive participant outcomes?
2. **Community profile:** Who is participating, and how does participation differ across configured segments?

The canonical terminology is deliberately community-neutral:

- **Organizer:** the community or group running events.
- **Participant:** a person who registers for or attends an event.
- **Registration:** one participant's registration for one event.
- **Survey response:** one submitted event survey.
- **Feedback answer:** one free-text answer within a survey response.
- **Event format:** how an event is delivered, such as online, in person, workshop, or talk.
- **Event topic:** the primary subject assigned to an event.
- **Segment:** a configured participant attribute used for aggregate comparison.

Community names, demographic labels, survey wording, and organizer-specific terms are configuration, not canonical schema names.

## Conformance levels

- **Core conformance** requires a valid `events` dataset. It supports event discovery, period filtering, and any event-level metrics backed by supplied fields.
- **Programme conformance** adds rating or feedback datasets. Each programme module is enabled only when its required evidence is present.
- **Community conformance** adds registrations. Participant-returning metrics additionally require either participant summaries or enough registration history to derive them.
- **Full conformance** supplies every dataset and all fields needed by the two current dashboards.

A source does not need full conformance to load. Unsupported modules must be unavailable explicitly; they must not be populated with zeros, inferred demographic values, or unrelated fallback fields.

## Dataset overview

Canonical adapters return the following logical datasets. The names below are product concepts; an adapter may map differently named source tabs or tables to them.

| Canonical dataset | Current source name | Grain | Requirement |
| --- | --- | --- | --- |
| `events` | `dim_events` | One row per event | Core required |
| `surveyResponses` | `fact_feedbackscale` | One row per submitted survey response | Optional |
| `feedbackAnswers` | `fact_feedbacktxt` | One row per free-text answer to one survey question | Optional |
| `registrations` | `fact_registrants` | One row per participant-event registration | Optional |
| `participants` | `dim_registrants` | One row per de-identified participant | Optional |

Unknown source columns may be retained for provenance or adapter debugging, but dashboard logic must depend only on canonical fields.

## Canonical fields

The requirement column uses:

- **Required:** the dataset row is invalid without the field.
- **Feature:** required only for the named feature; absence disables that feature.
- **Optional:** retained when available and never fabricated.

### `events`

| Field | Type | Requirement | Meaning |
| --- | --- | --- | --- |
| `event_id` | string | Required | Stable unique event identifier. Must not contain a person's identity. |
| `event_name` | string | Required | Human-readable event title. |
| `event_date` | date | Required | Event date in the configured reporting timezone. |
| `format` | string | Feature: format filter/grouping | Organizer-defined delivery format. |
| `topic_primary` | string | Feature: topic filter/grouping | Organizer-defined primary topic. |
| `registered` | non-negative integer or null | Feature: demand and registration totals | Count of registrations for the event. |
| `attended` | non-negative integer or null | Feature: attendance and response rate | Count of attendees for the event. |
| `capacity` | non-negative integer or null | Optional | Stated venue or platform capacity. |
| `feedback_responses` | non-negative integer or null | Optional | Source-provided response count for reconciliation only. Canonical response metrics use response rows. |
| `year_median_registered` | positive number or null | Feature: demand index fallback | Median registrations for comparable events in the same calendar year. |
| `demand_index` | non-negative number or null | Feature: demand quadrant | `registered / year_median_registered`, or an authoritative equivalent supplied by the source. |

`event_id`, not `event_name`, defines event uniqueness. Repeated event titles remain separate events.

### `surveyResponses`

| Field | Type | Requirement | Meaning |
| --- | --- | --- | --- |
| `response_id` | string | Required | Stable survey-response identifier. It must not encode a participant identity. |
| `event_id` | string | Required | Event foreign key. |
| `satisfaction` | number or null | Feature: satisfaction metrics | Participant rating on the configured satisfaction scale. |
| `recommend` | number or null | Feature: recommendation metrics | Participant rating on the configured recommendation scale. |
| `experience_segment` | string or null | Feature: direct survey segmentation | Optional segment recorded on the survey response itself. |

Rating bounds belong to configuration. Values outside configured bounds are invalid, not silently clamped.

Survey responses are anonymous unless an adopter explicitly extends the contract. The product must never infer that a response belongs to a registration merely because they share an event.

### `feedbackAnswers`

| Field | Type | Requirement | Meaning |
| --- | --- | --- | --- |
| `response_id` | string | Required | Survey-response foreign key. |
| `event_id` | string | Required | Event foreign key, retained for direct event scoping and validation. |
| `question_role` | string | Required | Configured semantic role, such as `positive`, `improvement`, or `topic_request`. It is not the displayed survey wording. |
| `text` | non-empty string | Required | The participant's answer. |
| `answer_id` | string or null | Optional | Stable identifier when the source provides one. Otherwise the compound row identity is adapter-defined. |

Question roles and their displayed labels are configuration. The current source values `text_good`, `text_improve`, and `text_interest` are adapter mappings, not universal product concepts.

### `registrations`

| Field | Type | Requirement | Meaning |
| --- | --- | --- | --- |
| `participant_id` | string | Required | Stable de-identified participant key. |
| `event_id` | string | Required | Event foreign key. |
| `attended` | boolean or null | Optional | Attendance outcome when known. Null means unknown. |
| `attendance_known` | boolean | Optional | Whether attendance was recorded. If omitted, a non-null `attended` value implies known attendance. |
| `experience_segment` | string or null | Feature: experience views | Configured experience or seniority bucket. |
| `gender_segment` | string or null | Feature: gender views | Self-described or source-normalized gender bucket. |
| `job_family_segment` | string or null | Feature: job-family views | Source-normalized job-family bucket. |
| `sector_segment` | string or null | Feature: sector views | Source-normalized employment-sector bucket. |
| `organization_segment` | string or null | Feature: organization views and organizer exclusion | Source-normalized organization label. |
| `status` | string or null | Optional | Organizer-defined registration status. |

Only configured segment fields may be displayed. Adapters may map other community-relevant dimensions into an extended segment registry in a later contract version; dashboard code must not assume that every adopter collects the five fields above.

### `participants`

| Field | Type | Requirement | Meaning |
| --- | --- | --- | --- |
| `participant_id` | string | Required | Stable de-identified participant key. |
| `events_registered` | non-negative integer or null | Feature: lifetime returning status | Number of events registered for within the source's declared history window. |
| `events_attended` | non-negative integer or null | Optional | Number of events attended within that history window. |
| `is_returning_registered` | boolean or null | Feature: lifetime returning status | Whether `events_registered >= 2`. Supplied values must reconcile with the count when both exist. |
| `is_returning_attended` | boolean or null | Optional | Whether the participant attended at least two events in the declared history window. |

Participant records must not contain names, email addresses, phone numbers, raw account IDs, or reversible identifiers. Hashing alone is not sufficient if the input space is easily enumerable; adopters are responsible for producing suitably de-identified keys.

## Keys and joins

1. `events.event_id` must be unique and is the parent key for every event-scoped dataset.
2. `surveyResponses.response_id` must be unique.
3. Every survey response, feedback answer, and registration must reference an existing `event_id`. Orphan rows are rejected and reported; they are not silently reassigned.
4. Every feedback answer must reference an existing `response_id`, and its `event_id` must equal the parent response's `event_id`.
5. `participants.participant_id` must be unique.
6. Every registration may join to one participant. If the participants dataset is absent, event and demographic registration views may still work, but lifetime participant metrics do not.
7. At most one canonical registration row may exist for a `(participant_id, event_id)` pair unless an adapter explicitly resolves multiple source records to one canonical row.
8. Survey responses must never be joined to participants without an explicit, consented, authoritative key in a future contract extension.

Adapters must report duplicate keys, orphan rows, and event mismatches. They may reject the source or quarantine invalid rows according to configured validation policy, but must expose the resulting row counts and limitations.

## Normalization rules

### Missing values

- Empty strings, whitespace-only strings, `null`, and absent optional fields normalize to null.
- Null means unknown or unavailable. It must not become zero, `false`, `Not stated`, or `Unmapped` during canonical ingestion.
- Display labels such as “Not stated” are presentation mappings applied after null preservation.
- An observed count of zero remains numeric zero and is distinct from null.
- Rows missing a required key are invalid.

### Numbers

- Numeric strings may contain grouping separators and surrounding whitespace.
- Counts must be whole and non-negative.
- Satisfaction and recommendation values must fall within their configured inclusive rating bounds; the default scale is 1–10.
- Rates are recomputed from their numerators and denominators whenever canonical rows permit it; subgroup rates are not averaged.
- Invalid numbers become validation errors, not zero.

### Booleans

Adapters may accept case-insensitive `true`/`false`, `yes`/`no`, and `1`/`0`. Blank values normalize to null. An unrecognized non-blank value is invalid.

### Dates and timezones

- Preferred interchange format is ISO 8601: `YYYY-MM-DD` for dates and an offset-bearing timestamp for datetimes.
- An adapter may accept a documented source-specific date format, but ambiguous day/month strings require an explicit locale.
- Date-only event values are interpreted in the configured reporting timezone, not the browser's local timezone.
- Period filters are inclusive of both boundary dates.
- The source metadata must declare the reporting timezone and the time at which the data was fetched or generated.

### Categories

- Category values are trimmed but otherwise preserved unless the adapter has an explicit mapping table.
- Ordering, display names, colors, and null labels belong to configuration.
- Unrecognized categories remain visible as source values or map to a declared `Other` bucket; they must not disappear silently.
- Organizer/staff exclusions are configured values applied consistently to all affected community-profile measures.

## Source metadata and provenance

Every normalized load must provide:

| Field | Meaning |
| --- | --- |
| `source_label` | Human-readable source name. |
| `source_kind` | Adapter identifier such as `synthetic`, `google-sheets`, `csv`, or `api`. |
| `data_classification` | `synthetic`, `anonymized`, or another explicitly documented classification. |
| `fetched_at` | Offset-bearing timestamp at which the source was read or generated. |
| `reporting_timezone` | IANA timezone used for event dates and period filters. |
| `contract_version` | `1`. |
| `history_start` / `history_end` | Available source-history bounds when known. |
| `limitations` | Adapter or validation limitations that affect interpretation. |

Synthetic data must always remain classified as synthetic. Real participant feedback must never be used as fallback demo content.

## Metric definitions

All metrics use the events selected by the active event, format, topic, and inclusive period filters. Fact rows are included only when their `event_id` is in that event set.

| Metric | Definition |
| --- | --- |
| Events | Distinct `event_id` count. |
| Registrations | Sum of non-null `events.registered`. If derived instead from registration rows, label and provenance must state that basis; do not mix bases within one view. |
| Attendance | Sum of non-null `events.attended`. Registration-level attendance may be used as an explicitly labeled alternative. |
| Unique participants | Distinct `registrations.participant_id` within the filtered event set. |
| Average satisfaction | Arithmetic mean of valid, non-null `surveyResponses.satisfaction` values in scope. |
| Average recommendation | Arithmetic mean of valid, non-null `surveyResponses.recommend` values in scope. |
| Survey response rate | Distinct in-scope `response_id` count divided by in-scope attendance. Requires a positive attendance denominator. Null when the denominator is missing or zero. |
| Demand index | Event registrations divided by that event's comparable-year median registrations, or an authoritative supplied equivalent. Null when either input is unavailable or the median is not positive. |
| Hot topic | Topic with the greatest summed attendance across events in scope. Ties use a deterministic configured ordering and should be disclosed when material. |
| Lifetime returner share | Among distinct participants registered for the selected events, the share whose `is_returning_registered` is true in the declared source-history window. This may include registrations outside the active period and must be labeled accordingly. |
| Selection return rate | Optional alternative: share of distinct participants with registrations for at least two events inside the current selection. It must not be presented as the lifetime returner share. |

### Demand-satisfaction quadrant

- One event point uses its `demand_index`, mean satisfaction, and registration count.
- Topic and format satisfaction are weighted by the number of valid satisfaction responses, not by a source summary count.
- Aggregated demand is the arithmetic mean of valid event demand indices unless configuration specifies and labels another method.
- Reference lines are medians across the declared comparison population. The UI must state whether that population is all loaded events or only the active selection.
- Suggested actions such as “Scale” or “Improve” are configurable interpretations of relative position, not causal conclusions.

### Segment metrics

- Registration-based segments use registration rows and clearly distinguish registrations from unique participants.
- Returning measures deduplicate participants within each segment.
- Survey outcomes may be segmented only by attributes captured on the response itself or joined through an explicit authoritative key. Event composition is not participant-level survey attribution.
- Small samples are excluded from displayed parent totals whenever subtraction could disclose them; they follow the privacy display rules below.

## Privacy and safe display

1. Canonical data must contain no direct personal identifiers.
2. A configured `minimum_segment_size` applies to every segment value, tooltip, label, drill-down, and export—not only to chart color.
3. Below-threshold segments may be combined into a configured “Other / small groups” bucket when that combination is analytically valid. Otherwise their metric and record drill-down are suppressed.
4. Free-text feedback must not be shown until the filtered selection has at least the configured number of distinct respondents. Search, chart interactions, and parent totals must not allow differencing attacks that reveal suppressed groups.
5. Organizer/staff exclusions must use configured normalized values and be disclosed in the affected view.
6. Missing demographics must remain in denominators where the measure calls for all participants and appear as a configured unknown bucket.
7. Feedback is evidence from respondents, not evidence about non-respondents. The product must display response counts beside rating-derived claims.

This contract reduces accidental disclosure but does not replace consent, legal review, or an adopter's own disclosure-risk assessment.

## Feature availability and graceful degradation

| Feature | Minimum evidence | Behavior when unavailable |
| --- | --- | --- |
| Event and period filters | Valid `events` rows | Application cannot load without them; show a schema-specific error. |
| Format or topic filters | Corresponding non-null event field | Omit only the unsupported filter and grouping toggle. |
| Registration totals | `events.registered` | Show unavailable; do not derive unless the configured metric basis is registration rows. |
| Attendance totals | `events.attended` | Show unavailable. |
| Response rate | Survey responses plus attendance | Show unavailable with the missing denominator named. |
| Demand quadrant | Valid demand and satisfaction for at least one event | Omit the quadrant or show an evidence-specific empty state. |
| Feedback board | Valid feedback answers | Omit the board; never substitute sample comments into live data. |
| A demographic chart | Registrations plus that configured segment | Omit that chart without disabling unrelated community views. |
| Unique participants | Registrations | Show unavailable when registration rows are absent. |
| Lifetime returner share | Registrations plus participant returning status | Show unavailable; do not infer from event totals. |
| Survey outcome by segment | The segment captured on each survey response | Disable unsupported segment choices and explain why. |

The product must distinguish loading, source failure, invalid schema, unsupported feature, legitimate empty selection, all-null measurement, and observed zero.

## Versioning

- Contract version 1 is identified by `contract_version: 1` in normalized source metadata.
- Additive optional fields do not require a major version change.
- Renaming a canonical field, changing a field's meaning or grain, changing a key, or changing a published metric denominator requires a new contract version and migration notes.
- Adapter-specific source mappings may evolve independently as long as their canonical output remains conformant.

## Current implementation conformance gaps

These are implementation tasks for later generalization steps, not exceptions to the contract:

- The optional Google Sheets adapter supports configurable tab names and column aliases. More complex source transformations still need a dedicated adapter.
- Source selection is environment-driven rather than exposed through a setup screen. Synthetic data is the safe default.
- The dashboard currently supports five configured participant segment slots and three canonical feedback roles; adding new slot or role types still requires code.
- Some chart styling and deterministic feedback action rules remain implementation defaults rather than configuration.

Until those gaps are addressed, this document is the target contract for migration rather than a claim that every existing runtime path conforms.
