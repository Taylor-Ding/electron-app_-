import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 应用渲染崩溃:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', background: '#0d1117',
          color: '#f4f7fb', fontFamily: 'system-ui, sans-serif', padding: 24
        }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>应用出现异常</h1>
          <p style={{ color: '#a3b0c6', marginBottom: 24, textAlign: 'center', maxWidth: 500 }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              background: '#8bd3ff', color: '#0d1117', fontWeight: 600,
              cursor: 'pointer', fontSize: 15
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
