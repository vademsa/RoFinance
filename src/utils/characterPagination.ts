export const CHARACTER_PAGE_SIZE = 6;

export function paginateCharacterItems<T>(items: readonly T[], requestedPage: number, pageSize = CHARACTER_PAGE_SIZE) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size');
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, totalPages, total: items.length,
    first: items.length ? start + 1 : 0, last: Math.min(start + pageSize, items.length) };
}
