import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const remove = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), [])
  const show = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID()
    setToasts((items) => [...items, { id, message, type }])
    window.setTimeout(() => remove(id), 4500)
  }, [remove])
  const value = useMemo(() => ({ show }), [show])
  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => <div key={toast.id} className={`toast ${toast.type}`}>
        {toast.type === 'error' ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}
        <span>{toast.message}</span>
        <button type="button" onClick={() => remove(toast.id)} aria-label="ปิดการแจ้งเตือน"><X size={18} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}

export const useToast = () => useContext(ToastContext)
