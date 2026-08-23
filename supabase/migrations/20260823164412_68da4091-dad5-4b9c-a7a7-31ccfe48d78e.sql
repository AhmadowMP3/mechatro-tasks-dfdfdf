CREATE TABLE public.server_setup_vault (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  salt text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.server_setup_vault TO service_role;

ALTER TABLE public.server_setup_vault ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER server_setup_vault_updated_at
BEFORE UPDATE ON public.server_setup_vault
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();