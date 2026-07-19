import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { useI18n } from '@/i18n';
export class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        const tag = this.props.label ? `[error-boundary:${this.props.label}]` : '[error-boundary]';
        console.error(tag, error, info.componentStack);
        this.props.onError?.(error, info);
    }
    reset = () => {
        this.setState({ error: null });
    };
    render() {
        const { error } = this.state;
        if (!error) {
            return this.props.children;
        }
        if (this.props.fallback) {
            return this.props.fallback({ error, reset: this.reset });
        }
        return _jsx(RootErrorFallback, { error: error, reset: this.reset });
    }
}
function RootErrorFallback({ error, reset }) {
    const { t } = useI18n();
    return (_jsx("div", { className: "fixed inset-0 z-[1500] grid place-items-center bg-(--ui-chat-surface-background) p-6", children: _jsxs(ErrorState, { className: "w-full max-w-[28rem]", description: error.message || t.errors.boundaryDesc, title: t.errors.boundaryTitle, children: [_jsx(Button, { className: "font-semibold", onClick: reset, size: "lg", children: t.common.retry }), _jsx(Button, { onClick: () => window.location.reload(), variant: "text", children: t.errors.reloadWindow }), _jsx(Button, { onClick: () => void window.hermesDesktop?.revealLogs()?.catch(() => undefined), variant: "text", children: t.errors.openLogs })] }) }));
}
