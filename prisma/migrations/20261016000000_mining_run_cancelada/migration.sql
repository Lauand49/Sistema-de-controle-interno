-- Ajuste pós-Etapa 3 (T1): mineração pode ser parada pelo usuário.
--
-- `ALTER TYPE ... ADD VALUE` fica SOZINHO neste arquivo: no Postgres o valor novo de um enum
-- não pode ser usado na mesma transação em que foi criado. Nada aqui referencia 'CANCELADA'.
-- O índice parcial "MiningRun_one_active_per_author_params" (status IN ('PENDENTE',
-- 'EM_ANDAMENTO')) não muda: uma mineração CANCELADA simplesmente deixa de estar "ativa".

-- AlterEnum
ALTER TYPE "MiningStatus" ADD VALUE IF NOT EXISTS 'CANCELADA';
