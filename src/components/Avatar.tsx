import { avatarColor, initials } from "@/lib/ui-tokens";

export function Avatar({ name, id, size = 36 }: { name: string; id: string; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: avatarColor(id), color: "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: Math.round(size * 0.4), flexShrink: 0,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
