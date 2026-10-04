-- P4: alinha o trigger `company_set_tem_contato` com a função TypeScript `temContato()`
-- (lib/leads/contact.ts). A versão de 20261017 usava btrim(x), que só remove espaços; o TypeScript
-- descarta espaço, tab, quebras de linha, avanço de página e tab vertical. A regra passa a ser a
-- mesma nos dois lados. A migração 20261017000000 NÃO foi editada: a função é redefinida aqui.
--
-- MUDANÇAS NA REGRA DE CONTATO: altere esta função E `temContato()` juntas, em migração nova
-- (CREATE OR REPLACE FUNCTION + backfill), e rode o teste de integração do trigger em scitec_test.
CREATE OR REPLACE FUNCTION "company_set_tem_contato"() RETURNS trigger AS $$
BEGIN
  NEW."temContato" := (
    btrim(COALESCE(NEW."telefone", ''), E' \t\n\r\f\v') <> ''
    OR btrim(COALESCE(NEW."whatsappOsm", ''), E' \t\n\r\f\v') <> ''
    OR btrim(COALESCE(NEW."instagramOsm", ''), E' \t\n\r\f\v') <> ''
    OR btrim(COALESCE(NEW."emailOsm", ''), E' \t\n\r\f\v') <> ''
    OR COALESCE(NEW."temWhatsapp", false)
    OR COALESCE(NEW."temInstagram", false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalcula as linhas existentes (a atribuição idempotente dispara o trigger; não altera dados).
UPDATE "Company" SET "telefone" = "telefone";
