export function paginateItems(items, requestedPage, pageSize) {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.max(1, Math.min(requestedPage, pages))
  const offset = (page - 1) * pageSize
  return { items: items.slice(offset, offset + pageSize), total, pages, page, offset }
}
