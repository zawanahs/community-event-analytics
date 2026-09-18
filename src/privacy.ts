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
  combined?: boolean;
};

export type DisclosureGroups<T> = {
  groups: DisclosureGroup<T>[];
  hasUnsafeRemainder: boolean;
};

// Small, mutually exclusive categories can be combined only when the combined
// category also meets the threshold. A single hidden remainder would otherwise
// be recoverable from the displayed total minus the visible categories.
export function disclosureGroups<T>(rows: T[], keyFor: (row: T) => string): DisclosureGroups<T> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const visible: DisclosureGroup<T>[] = [];
  const small: DisclosureGroup<T>[] = [];
  for (const [key, groupRows] of grouped) {
    const group = { key, rows: groupRows, count: groupRows.length };
    (isDisclosureSafe(group.count) ? visible : small).push(group);
  }

  const pooledRows = small.flatMap((group) => group.rows);
  if (small.length > 1 && isDisclosureSafe(pooledRows.length)) {
    visible.push({ key: 'Other / small groups', rows: pooledRows, count: pooledRows.length, combined: true });
    return { groups: visible, hasUnsafeRemainder: false };
  }
  return { groups: visible, hasUnsafeRemainder: small.length > 0 };
}

export type ProtectedCrossTab<T> = {
  key: string;
  count: number;
  children: DisclosureGroup<T>[];
};

// A parent category is shown only if every child is safe or safely pooled. This
// stops a parent total or 100% stacked bar from exposing a suppressed child.
export function protectedCrossTab<T>(
  rows: T[],
  parentFor: (row: T) => string,
  childFor: (row: T) => string,
): ProtectedCrossTab<T>[] {
  const parents = new Map<string, T[]>();
  for (const row of rows) {
    const key = parentFor(row);
    parents.set(key, [...(parents.get(key) ?? []), row]);
  }

  return [...parents.entries()].flatMap(([key, parentRows]) => {
    const protectedChildren = disclosureGroups(parentRows, childFor);
    if (!isDisclosureSafe(parentRows.length) || protectedChildren.hasUnsafeRemainder) return [];
    return [{ key, count: parentRows.length, children: protectedChildren.groups }];
  });
}
