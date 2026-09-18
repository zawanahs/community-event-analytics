import Papa from 'papaparse';
import { communityConfig } from '../../config';
import type { DataSourceAdapter, RawDataBundle, RawDatasets } from '../contract';
import type { RawRow, SourceMetadata } from '../../types';

const DATASET_KEYS = [
  'events',
  'surveyResponses',
  'feedbackAnswers',
  'registrations',
  'participants',
] as const satisfies readonly (keyof RawDatasets)[];

async function fetchCsv(sheetId: string, tab: string): Promise<RawRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${tab}: HTTP ${response.status}`);
  const csv = await response.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new Error(`${tab}: CSV parse error${first.row == null ? '' : ` on row ${first.row + 1}`}: ${first.message}`);
  }
  return parsed.data;
}

export function createGoogleSheetsAdapter(): DataSourceAdapter {
  return {
    async load(): Promise<RawDataBundle> {
      const { googleSheets, reportingTimezone } = communityConfig.data;
      const { sheetId, tabs } = googleSheets;
      if (!sheetId) {
        throw new Error('Google Sheets is selected but VITE_GOOGLE_SHEET_ID is not configured.');
      }
      const rows = await Promise.all(DATASET_KEYS.map((key) => fetchCsv(sheetId, tabs[key])));
      const datasets = Object.fromEntries(DATASET_KEYS.map((key, index) => [key, rows[index]])) as unknown as RawDatasets;
      const source: SourceMetadata = {
        sourceLabel: communityConfig.data.sourceLabel,
        sourceKind: 'google-sheets',
        dataClassification: 'anonymized',
        fetchedAt: new Date(),
        reportingTimezone,
        contractVersion: 1,
        historyStart: null,
        historyEnd: null,
        limitations: [],
      };
      return { datasets, source };
    },
  };
}
