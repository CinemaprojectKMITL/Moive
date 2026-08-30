import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './layouts/AdminLayout'
import { CustomerLayout } from './layouts/CustomerLayout'
import { LoadingState } from './components/common/LoadingState'
import { ProtectedRoute } from './routes/ProtectedRoute'

const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })))
const HomePage = lazyNamed(() => import('./pages/HomePage'), 'HomePage')
const AuthPage = lazyNamed(() => import('./pages/AuthPage'), 'AuthPage')
const MovieDetailsPage = lazyNamed(() => import('./pages/MovieDetailsPage'), 'MovieDetailsPage')
const BranchesPage = lazyNamed(() => import('./pages/BranchesPage'), 'BranchesPage')
const BranchDetailsPage = lazyNamed(() => import('./pages/BranchDetailsPage'), 'BranchDetailsPage')
const SeatSelectionPage = lazyNamed(() => import('./pages/SeatSelectionPage'), 'SeatSelectionPage')
const CheckoutPage = lazyNamed(() => import('./pages/CheckoutPage'), 'CheckoutPage')
const MyBookingsPage = lazyNamed(() => import('./pages/MyBookingsPage'), 'MyBookingsPage')
const NotFoundPage = lazyNamed(() => import('./pages/NotFoundPage'), 'NotFoundPage')
const AdminDashboardPage = lazyNamed(() => import('./pages/admin/AdminDashboardPage'), 'AdminDashboardPage')
const AdminMoviesPage = lazyNamed(() => import('./pages/admin/AdminMoviesPage'), 'AdminMoviesPage')
const AdminBranchesPage = lazyNamed(() => import('./pages/admin/AdminBranchesPage'), 'AdminBranchesPage')
const AdminTheatersPage = lazyNamed(() => import('./pages/admin/AdminTheatersPage'), 'AdminTheatersPage')
const AdminShowsPage = lazyNamed(() => import('./pages/admin/AdminShowsPage'), 'AdminShowsPage')
const AdminBookingsPage = lazyNamed(() => import('./pages/admin/AdminBookingsPage'), 'AdminBookingsPage')
const AdminBannersPage = lazyNamed(() => import('./pages/admin/AdminBannersPage'), 'AdminBannersPage')

export default function App() {
  return <Suspense fallback={<LoadingState />}><Routes>
    <Route element={<CustomerLayout />}>
      <Route index element={<HomePage />} />
      <Route path="login" element={<AuthPage mode="login" />} />
      <Route path="register" element={<AuthPage mode="register" />} />
      <Route path="movies/:movieId" element={<MovieDetailsPage />} />
      <Route path="branches" element={<BranchesPage />} />
      <Route path="branches/:branchId" element={<BranchDetailsPage />} />
      <Route path="shows/:showId/seats" element={<SeatSelectionPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="checkout/:bookingId" element={<CheckoutPage />} />
        <Route path="my-bookings" element={<MyBookingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Route>
    <Route element={<ProtectedRoute admin />}>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="movies" element={<AdminMoviesPage />} />
        <Route path="branches" element={<AdminBranchesPage />} />
        <Route path="theaters" element={<AdminTheatersPage />} />
        <Route path="shows" element={<AdminShowsPage />} />
        <Route path="bookings" element={<AdminBookingsPage />} />
        <Route path="banners" element={<AdminBannersPage />} />
      </Route>
    </Route>
  </Routes></Suspense>
}
