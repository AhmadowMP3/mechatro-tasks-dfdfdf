// Shared branded payment-method dropdown. Uses ThemedSelect so it matches the
// rest of the app (brand blue focus, dark card popup, RTL-aware) and keeps
// every finance form on one style. Includes iconography per method so the
// list is instantly scannable — helpful for the older master admin.

import * as React from "react";
import { Banknote, Landmark, FileCheck2, CreditCard, Smartphone, MoreHorizontal } from "lucide-react";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { useApp } from "@/lib/app-context";
import type { PaymentMethod } from "@/lib/finance";
import type { DictKey } from "@/i18n/dict";

const ICONS: Record<PaymentMethod, React.ReactNode> = {
  cash:          <Banknote size={16} style={{ color: "#189FD1" }} />,
  bank_transfer: <Landmark size={16} style={{ color: "#189FD1" }} />,
  cheque:        <FileCheck2 size={16} style={{ color: "#189FD1" }} />,
  card:          <CreditCard size={16} style={{ color: "#189FD1" }} />,
  sham_cash:     <Smartphone size={16} style={{ color: "#C8A24B" }} />, // gold accent → highlights the new local method
  other:         <MoreHorizontal size={16} style={{ color: "#189FD1" }} />,
};

// Ordered — Sham Cash lives near the top since it's the primary local option.
const ORDER: readonly PaymentMethod[] = ["cash", "sham_cash", "bank_transfer", "cheque", "card", "other"];
const LABEL_KEY: Record<PaymentMethod, DictKey> = {
  cash: "methodCash",
  bank_transfer: "methodBankTransfer",
  cheque: "methodCheque",
  card: "methodCard",
  sham_cash: "methodShamCash",
  other: "methodOther",
};

export function PaymentMethodSelect({
  value,
  onChange,
  disabled,
  style,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const { t } = useApp();
  const options = React.useMemo(
    () => ORDER.map((m) => ({
      value: m,
      label: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {ICONS[m]}
          <span>{t(LABEL_KEY[m])}</span>
        </span>
      ),
    })),
    [t],
  );

  return (
    <ThemedSelect
      value={value}
      onChange={(v) => onChange(v as PaymentMethod)}
      options={options}
      disabled={disabled}
      style={style}
      ariaLabel={t("paymentMethod")}
      searchable={false}
    />
  );
}
