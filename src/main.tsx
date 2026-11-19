import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Beklenmeyen bir çalışma zamanı hatası oluştu.',
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#0A0D12] p-6 text-slate-100">
          <div className="max-w-md rounded-2xl border border-white/10 bg-[#11161F] p-6 text-center">
            <h1 className="text-base font-semibold text-white">3Drecon Motoru Yeniden Başlatılmalı</h1>
            <p className="mt-2 text-xs text-slate-400 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex min-h-[40px] items-center justify-center rounded-xl bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400 transition"
            >
              Yeniden Yükle
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);

// Register offline-capable PWA service worker safely without blocking initial render
try {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Ignore SW registration restrictions inside sandboxed preview iframes
    },
  });
} catch {
  // Non-fatal if Service Worker API is unavailable
}
