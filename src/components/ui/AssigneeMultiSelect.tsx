import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { Profile } from "@/lib/app-context";

/**
 * Multi-assignee picker: chip summary + dropdown checkbox list with search.
 * Fully controlled — parent owns the string[] of user ids.
 */
export function AssigneeMultiSelect({
  users,
  value,
  onChange,
  placeholder = "—",
}: {
  users: Profile[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = value.map((id) => users.find((u) => u.id === id)).filter(Boolean) as Profile[];
  const filtered = users.filter((u) => u.full_name.toLowerCase().includes(q.toLowerCase()));

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const remove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          minHeight: 44,
          padding: "6px 10px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          color: "var(--foreground)",
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          textAlign: "start",
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: "var(--muted)", flex: 1 }}>{placeholder}</span>
        ) : (
          selected.map((u) => (
            <span
              key={u.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 6px 3px 3px",
                borderRadius: 999,
                background: "var(--surface-3)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <Avatar id={u.id} name={u.full_name} size={20} />
              {u.full_name}
              <span
                role="button"
                aria-label="remove"
                onClick={(e) => remove(u.id, e)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--surface-2)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={12} />
              </span>
            </span>
          ))
        )}
        <ChevronDown size={16} style={{ marginInlineStart: "auto", color: "var(--muted)" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            zIndex: 30,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,.24)",
            maxHeight: 280,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <input
            autoFocus
            placeholder="🔎"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "none",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--foreground)",
              outline: "none",
              fontSize: 14,
            }}
          />
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 14, color: "var(--muted)", textAlign: "center", fontSize: 13 }}>—</div>
            )}
            {filtered.map((u) => {
              const on = value.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 12px",
                    background: on ? "color-mix(in oklab, var(--grad-blue) 15%, transparent)" : "transparent",
                    border: "none",
                    color: "var(--foreground)",
                    cursor: "pointer",
                    fontSize: 14,
                    textAlign: "start",
                  }}
                >
                  <Avatar id={u.id} name={u.full_name} size={24} />
                  <span style={{ flex: 1 }}>{u.full_name}</span>
                  {on && <Check size={16} color="#3ECF8E" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
