"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#F2F2F2] p-6 text-center">
          <img src="/steward.png" alt="Steward" className="w-16 h-16 mb-4" />
          <h2 className="text-lg font-bold text-e-grey-dark mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-e-grey mb-6 max-w-sm">
            Steward ran into an unexpected error. Please reload the page to try again.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="px-6 py-2 bg-e-indigo-light text-white rounded-full hover:bg-e-indigo transition-colors cursor-pointer"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
