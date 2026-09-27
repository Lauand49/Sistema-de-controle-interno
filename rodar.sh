#!/bin/bash
export PATH=$HOME/.local/bin:$PATH
echo "🚀 Iniciando o servidor de desenvolvimento da SciTec jr..."
cd "$(dirname "$0")"
npm run dev
