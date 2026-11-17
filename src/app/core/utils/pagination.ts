/**
 * Page numbers to show under a table: the first and last pages, the current one and its
 * neighbours; null where pages are left out ("…"). A gap of a single page shows that page
 * instead. Pages count from 1.
 */
export function pageList(page: number, pages: number): (number | null)[] {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let last = 0;
  for (const p of shown) {
    if (p - last === 2) out.push(last + 1);
    else if (p - last > 2) out.push(null);
    out.push(p);
    last = p;
  }
  return out;
}
