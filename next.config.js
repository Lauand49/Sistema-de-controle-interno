/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build de produção enxuto (.next/standalone + server.js) para a imagem Docker da Etapa 4.
  // `next start` continua funcionando; o Dockerfile copia public/ e .next/static para a imagem.
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['sonner'],
};

module.exports = nextConfig;
