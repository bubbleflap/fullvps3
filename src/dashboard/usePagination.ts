import { useState, useMemo, useEffect } from "react";

const PAGE_SIZE = 15;
const MAX_PAGES = 5;

export function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(1);

  const capped = useMemo(() => items.slice(0, PAGE_SIZE * MAX_PAGES), [items]);
  const totalPages = Math.max(1, Math.min(MAX_PAGES, Math.ceil(capped.length / PAGE_SIZE)));

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paged = useMemo(
    () => capped.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [capped, page]
  );

  return { paged, page, setPage, totalPages, total: capped.length };
}
