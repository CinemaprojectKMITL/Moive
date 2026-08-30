import { X } from 'lucide-react'

export function Modal({ title, open, onClose, children }) {
  if (!open) return null
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button className="icon-btn" onClick={onClose} aria-label="ปิด"><X /></button></header><div className="modal-body">{children}</div></section></div>
}
