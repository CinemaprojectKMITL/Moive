import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../components/common/LoadingState'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute({ admin = false }) {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState label="กำลังตรวจสอบเซสชัน..." />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (admin && !isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
