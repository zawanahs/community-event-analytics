import { communityConfig } from './config';

export const minimumSegmentSize = () => communityConfig.privacy.minimumSegmentSize;

export const isDisclosureSafe = (count: number) => count >= minimumSegmentSize();

export const distinctResponseCount = (rows: Array<{ response_id?: string }>) =>
  new Set(rows.map((row) => row.response_id).filter(Boolean)).size;

export const canShowFeedback = (rows: Array<{ response_id?: string }>) =>
  isDisclosureSafe(distinctResponseCount(rows));

export type DisclosureGroup<T> = {
  key: string;
  rows: T[];
  count: number;
  privacyCount: number;
  combined?: boolean;
};

export type DisclosureGroups<T> = {
  groups: DisclosureGroup<T>[];
  hasUnsafeRemainder: boolean;
};

// Small, mutually exclusive categories can be combined only when the combined
// category also meets the threshold. A single hidden remainder would otherwise
// be recoverable from the displayed total minus the visible categories.
const disclosureCount = <T>(rows: T[], distinctFor?: (row: T) => unknown) =>
  distinctFor ? new Set(rows.map(distinctFor)).size : rows.length;

export function disclosureGroups<T>(
  rows: T[],
  keyFor: (row: T) => string,
  distinctFor?: (row: T) => unknown,
): DisclosureGroups<T> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const visible: DisclosureGroup<T>[] = [];
  const small: DisclosureGroup<T>[] = [];
  for (const [key, groupRows] of grouped) {
    const group = {
      key,
      rows: groupRows,
      count: groupRows.length,
      privacyCount: disclosureCount(groupRows, distinctFor),
    };
    (isDisclosureSafe(group.privacyCount) ? visible : small).push(group);
  }

  const pooledRows = small.flatMap((group) => group.rows);
  const pooledPrivacyCount = disclosureCount(pooledRows, distinctFor);
  if (small.length > 1 && isDisclosureSafe(pooledPrivacyCount)) {
    visible.push({
      key: 'Other / small groups',
      rows: pooledRows,
      count: pooledRows.length,
      privacyCount: pooledPrivacyCount,
      combined: true,
    });
    return { groups: visible, hasUnsafeRemainder: false };
  }
  return { groups: visible, hasUnsafeRemainder: small.length > 0 };
}

export type ProtectedCrossTab<T> = {
  key: string;
  count: number;
  privacyCount: number;
  children: DisclosureGroup<T>[];
};

// A parent category is shown only if every child is safe or safely pooled. This
// stops a parent total or 100% stacked bar from exposing a suppressed child.
export function protectedCrossTab<T>(
  rows: T[],
  parentFor: (row: T) => string,
  childFor: (row: T) => string,
  distinctFor?: (row: T) => unknown,
): ProtectedCrossTab<T>[] {
  const parents = new Map<string, T[]>();
  for (const row of rows) {
    const key = parentFor(row);
    parents.set(key, [...(parents.get(key) ?? []), row]);
  }

  return [...parents.entries()].flatMap(([key, parentRows]) => {
    const privacyCount = disclosureCount(parentRows, distinctFor);
    const protectedChildren = disclosureGroups(parentRows, childFor, distinctFor);
    if (!isDisclosureSafe(privacyCount) || protectedChildren.hasUnsafeRemainder) return [];
    return [{ key, count: parentRows.length, privacyCount, children: protectedChildren.groups }];
  });
}
