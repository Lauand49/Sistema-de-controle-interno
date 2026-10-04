-- T4 (ajustes pós-etapa 3): abas "Com contato" / "Sem contato".
-- Nova coluna de e-mail (tag OSM) e coluna derivada `temContato`, mantida por trigger para que
-- qualquer escrita (descoberta, análise, reanálise, edição manual) a mantenha correta.

ALTER TABLE "Company" ADD COLUMN "emailOsm" TEXT;
ALTER TABLE "Company" ADD COLUMN "temContato" BOOLEAN NOT NULL DEFAULT false;

-- Regra espelhada em lib/leads/contact.ts (computeTemContato).
CREATE OR REPLACE FUNCTION "company_set_tem_contato"() RETURNS trigger AS $$
BEGIN
  NEW."temContato" := (
    COALESCE(btrim(NEW."telefone"), '') <> ''
    OR COALESCE(btrim(NEW."whatsappOsm"), '') <> ''
    OR COALESCE(btrim(NEW."instagramOsm"), '') <> ''
    OR COALESCE(btrim(NEW."emailOsm"), '') <> ''
    OR COALESCE(NEW."temWhatsapp", false)
    OR COALESCE(NEW."temInstagram", false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Company_tem_contato"
  BEFORE INSERT OR UPDATE ON "Company"
  FOR EACH ROW EXECUTE FUNCTION "company_set_tem_contato"();

-- Preenche as linhas existentes (a atribuição idempotente dispara o trigger; não altera dados).
UPDATE "Company" SET "telefone" = "telefone";

CREATE INDEX "Company_temContato_scoreFinal_idx" ON "Company"("temContato", "scoreFinal" DESC);
