-- P3: marca atômica de que a avaliação automática dos leads sem contato já foi disparada para a
-- mineração (o servidor a dispara uma única vez ao marcá-la CONCLUIDA). Aditiva e nula por padrão.
ALTER TABLE "MiningRun" ADD COLUMN "avaliacaoIniciadaEm" TIMESTAMP(3);
