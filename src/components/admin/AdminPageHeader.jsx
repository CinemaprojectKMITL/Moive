export function AdminPageHeader({ eyebrow, title, description, action }) {
  return <div className="admin-page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>
}
