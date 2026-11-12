import { Component, type ErrorInfo, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Do not log workspace data or authentication details. */ }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="app-recovery" role="alert"><h1>This view could not be loaded.</h1><p>Your saved workspace has not been cleared. Retry this view, or reload the application to load the latest version.</p><div className="button-row"><button className="btn btn-primary" onClick={() => this.setState({ failed: false })}>Retry view</button><button className="btn btn-secondary" onClick={() => window.location.reload()}>Reload application</button><a className="btn btn-ghost" href="/">Return to overview</a></div></main>
  }
}
