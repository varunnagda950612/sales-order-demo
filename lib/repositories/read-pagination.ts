const offsetCursorPrefix = "offset:";

export function createOffsetCursor(offset: number) {
  return Number.isInteger(offset) && offset > 0 ? `${offsetCursorPrefix}${offset}` : null;
}

export function readOffsetCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return 0;
  }

  if (!cursor.startsWith(offsetCursorPrefix)) {
    return 0;
  }

  const offset = Number(cursor.slice(offsetCursorPrefix.length));
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

export function getNextOffsetCursor({
  currentOffset,
  fetchedCount,
  pageSize,
}: {
  currentOffset: number;
  fetchedCount: number;
  pageSize: number;
}) {
  return fetchedCount > pageSize ? createOffsetCursor(currentOffset + pageSize) : null;
}

export function getPageSize(value: string | null | undefined, defaultPageSize = 100) {
  const pageSize = Number(value || defaultPageSize);

  if (!Number.isInteger(pageSize)) {
    return defaultPageSize;
  }

  return Math.min(Math.max(pageSize, 1), 250);
}
