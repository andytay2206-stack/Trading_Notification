import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onReset: () => void
}

interface State {
  failed: boolean
}

export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, details: ErrorInfo) {
    console.error('Chart rendering failed', error, details)
  }

  private reset = () => {
    this.setState({ failed: false })
    this.props.onReset()
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="chart-error">
          <b>The chart recovered from a rendering error</b>
          <span>The market page is still available. Reload the feed to rebuild the chart safely.</span>
          <button type="button" className="secondary-button" onClick={this.reset}>Reload chart</button>
        </div>
      )
    }
    return this.props.children
  }
}
