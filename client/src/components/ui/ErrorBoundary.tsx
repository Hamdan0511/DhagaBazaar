import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Changing this (e.g. the current path) clears the error, so navigating away recovers. */
  resetKey?: string;
}

/**
 * Catches rendering errors (and failed lazy-loaded page chunks after a deploy) so one broken
 * page shows a recoverable message instead of a blank screen. Header and navigation keep working.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(this.state.error.message);
    return (
      <div role="alert" className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-danger-bg text-danger">
          <AlertTriangle className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-2xl font-semibold text-brand-900">{chunk ? 'A new version of Dhaaga Bazaar is available' : 'Something went wrong on this page'}</h1>
        <p className="mt-2 text-sm text-muted">{chunk ? 'Please reload to continue.' : 'Your data is safe. Reload the page, or go back and try again. If it keeps happening, contact our team.'}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="h-11 rounded-md bg-brand-900 px-5 text-sm font-medium text-white hover:bg-brand-800">
            Reload page
          </button>
          <a href="/" className="inline-flex h-11 items-center rounded-md border border-line-strong px-5 text-sm font-medium text-charcoal hover:bg-brand-50">
            Go to homepage
          </a>
        </div>
      </div>
    );
  }
}
