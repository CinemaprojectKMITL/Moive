import { Outlet } from 'react-router-dom'
import { Footer } from '../components/layout/Footer'
import { Navbar } from '../components/layout/Navbar'

export function CustomerLayout() {
  return <div className="app-shell"><Navbar /><main className="main-content"><Outlet /></main><Footer /></div>
}
