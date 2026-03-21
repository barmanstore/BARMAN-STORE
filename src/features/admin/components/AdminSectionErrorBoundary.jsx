import React from 'react';

class AdminSectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Admin section error:', error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onRetry === 'function') {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      const sectionLabel = String(this.props.sectionLabel || 'section').trim() || 'section';
      return (
        <div className="admin-loading-state admin-section-error" role="alert">
          <h2>Could not open {sectionLabel}</h2>
          <p>{this.state.error?.message || 'This admin section failed to render.'}</p>
          <button type="button" className="admin-btn" onClick={this.handleRetry}>
            Retry Section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AdminSectionErrorBoundary;
