import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ResponsiveModal } from "@/components/ui/ResponsiveModal";

export type PromptFilenameOptions = {
  defaultName: string;
  extension: string; // e.g. "xlsx" or "pdf"
  title?: string;
  label?: string;
  hint?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/** Strip characters illegal in most filesystems + trim. */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1F]+/g, "").replace(/\s+/g, " ").trim();
}

function stripExt(name: string, ext: string): string {
  const suffix = "." + ext.toLowerCase();
  return name.toLowerCase().endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

/**
 * Show a modal asking the user for a filename.
 * Returns the full filename (with extension) or null if cancelled.
 */
export function promptFilename(opts: PromptFilenameOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    const cleanup = () => {
      // Defer unmount out of React's own render cycle to avoid warnings.
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };

    const finish = (value: string | null) => {
      cleanup();
      resolve(value);
    };

    root.render(
      <PromptView
        opts={opts}
        onCancel={() => finish(null)}
        onConfirm={(name) => {
          const clean = sanitize(name) || sanitize(opts.defaultName) || "file";
          const base = stripExt(clean, opts.extension);
          finish(`${base}.${opts.extension.toLowerCase()}`);
        }}
      />,
    );
  });
}

function PromptView({
  opts,
  onCancel,
  onConfirm,
}: {
  opts: PromptFilenameOptions;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const defaultBase = stripExt(opts.defaultName, opts.extension);
  const [value, setValue] = React.useState(defaultBase);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(id);
  }, []);

  const submit = () => onConfirm(value);

  return (
    <ResponsiveModal title={opts.title ?? "File name"} onClose={onCancel} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ padding: "8px 4px 4px" }}
      >
        <label
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--muted)",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {opts.label ?? "File name"}
        </label>
        <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{
              flex: 1,
              padding: "10px 12px",
              minHeight: 48,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--foreground)",
              fontSize: 14,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              minHeight: 48,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            .{opts.extension.toLowerCase()}
          </div>
        </div>
        {opts.hint ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{opts.hint}</div>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            className="brand-btn"
            style={{
              background: "var(--surface-2)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
            }}
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button type="submit" className="brand-btn">
            {opts.confirmLabel ?? "Export"}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
