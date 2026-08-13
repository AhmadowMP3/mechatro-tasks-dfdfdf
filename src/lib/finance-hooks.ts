// Shared hooks for finance features
import { useQuery } from "@tanstack/react-query";
import { vaultDb as supabase } from "@/lib/finance/vault-db";
import type { CompanySettings } from "@/components/finance/BrandedDocuments";

/** Fetch financial_settings singleton, cached under ["financial_settings"]. */
export function useFinancialSettings() {
  return useQuery({
    queryKey: ["financial_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_settings").select("*").eq("id", true).maybeSingle();
      return (data ?? null) as CompanySettings | null;
    },
  });
}
