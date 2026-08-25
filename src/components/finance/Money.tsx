import { formatMoneyNumber, type Currency } from "@/lib/finance";
import { RiyalSymbol } from "@/lib/currency";
import { useApp } from "@/lib/app-context";

/** Renders a money amount. The Saudi Riyal uses its official symbol (inline SVG)
 *  since the glyph is missing from most fonts. */
export function Money({ amount, currency, bold }: { amount: number | string | null | undefined; currency: Currency; bold?: boolean }) {
  const { lang } = useApp();
  const num = formatMoneyNumber(amount);
  if (currency === "SAR") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: bold ? 700 : undefined, direction: "ltr" }}>
        <span>{num}</span>
        <RiyalSymbol size="0.9em" />
      </span>
    );
  }
  const sym = currency === "USD" ? "$" : lang === "ar" ? "ل.س" : "SYP";
  return (
    <span style={{ fontWeight: bold ? 700 : undefined, direction: "ltr", display: "inline-block" }}>
      {currency === "USD" ? `${sym}${num}` : `${num} ${sym}`}
    </span>
  );
}
