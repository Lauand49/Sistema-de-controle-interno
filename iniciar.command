#!/bin/bash

# Configura caminhos do ambiente para garantir acesso ao Node/NPM no macOS
export PATH=$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH

# Garante que a execução ocorra no diretório deste projeto
cd "$(dirname "$0")"

# Encerra eventuais processos travados na porta 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "========================================================"
echo "🚀 SciTec jr. - Sistema de Controle Interno para Negócios"
echo "========================================================"
echo "Iniciando servidor de desenvolvimento..."

# Rotina em segundo plano para aguardar o servidor compilar antes de abrir o navegador
(
  echo "Aguardando o servidor compilar e responder na porta 3000..."
  for i in {1..60}; do
    # Obtém o status HTTP retornado pelo servidor
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
    
    # Aguarda status de sucesso (200) ou redirecionamento válido (302, 307, 308)
    if [[ "$STATUS" == "200" || "$STATUS" == "302" || "$STATUS" == "307" || "$STATUS" == "308" ]]; then
      echo "✅ Servidor pronto e compilado! (HTTP $STATUS)"
      sleep 1
      echo "🌐 Abrindo SciTec jr. no navegador..."
      open "http://localhost:3000"
      exit 0
    fi
    sleep 0.5
  done

  # Fallback caso demore mais de 30 segundos
  echo "Abrindo navegador em http://localhost:3000..."
  open "http://localhost:3000"
) &

# Inicia a aplicação Next.js
npm run dev
