import { Component } from 'react';
/**
 * Local boundary for rich renderers (Mermaid parse throws, malformed SVG, a
 * provider widget blowing up). A failed embed must never blank the transcript —
 * we show the `fallback` (typically the raw source) and recover when `resetKey`
 * changes. Unlike MessageRenderBoundary this swallows ALL render errors, because
 * the blast radius is one self-contained block, not the message tree.
 */
export class RichBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    componentDidUpdate(prev) {
        if (this.state.failed && prev.resetKey !== this.props.resetKey) {
            this.setState({ failed: false });
        }
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
