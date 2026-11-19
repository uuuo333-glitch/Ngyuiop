import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class FirebaseErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'حدث خطأ غير متوقع في الاتصال بقاعدة البيانات.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#09090B] text-[#F5F2EB] flex items-center justify-center p-6"
        >
          <div className="max-w-lg w-full rounded-2xl border border-[#D4AF37]/40 bg-[#121216] p-6 space-y-4 text-center shadow-2xl">
            <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
            <h2 className="font-display text-xl font-bold text-[#E5C158]">
              تنبيه في المزامنة السحابية
            </h2>
            <p className="text-xs text-[#C5BFB2] break-words leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="btn-gold-wave h-10 px-6 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل الصفحة</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
