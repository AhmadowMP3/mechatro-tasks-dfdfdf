// Safety net around the document sheet: a failure inside the rich editor
// shows a small inline card instead of blanking the whole page.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

type Props = { ar: boolean; children: ReactNode };
type State = { error: Error | null; key: number };

export class EditorBoundary extends Component<Props, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Document editor crashed", error, info.componentStack);
  }

  reset = () => this.setState((s) => ({ error: null, key: s.key + 1 }));

  render() {
    const { ar, children } = this.props;
    if (this.state.error) {
      return (
        <div
          style={{
            border: "1px dashed var(--border)", borderRadius: 14, padding: 28,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {ar ? "تعذّر عرض المحرر" : "The editor could not be displayed"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", maxWidth: 420 }}>
            {ar
              ? "محتوى المستند محفوظ كما هو. أعد تحميل المحرر للمتابعة."
              : "Your document content is safe. Reload the editor to continue."}
          </div>
          <button type="button" className="btn-primary" onClick={this.reset}>
            <RefreshCw size={15} /> {ar ? "إعادة تحميل المحرر" : "Reload editor"}
          </button>
        </div>
      );
    }
    return <div key={this.state.key} style={{ minWidth: 0 }}>{children}</div>;
  }
}
