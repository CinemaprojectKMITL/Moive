import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('React error boundary', error, info) }
  render() {
    if (this.state.error) return <div className="state-panel full-page"><h2>หน้านี้ทำงานผิดพลาด</h2><p>กรุณารีเฟรชหน้า หรือลองใหม่อีกครั้ง</p><button className="btn-primary" onClick={() => window.location.assign('/')}>กลับหน้าหลัก</button></div>
    return this.props.children
  }
}
