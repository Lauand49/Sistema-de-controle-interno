/** @type {import('tailwindcss').Config} */
// Tokens semânticos: valores extraídos do que o site já usava (slate-950/900/800, purple-600/indigo-600),
// para que trocar classes soltas por tokens não mude a aparência. Ver docs/DESIGN.md.
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7c3aed', // purple-600
          hover: '#6d28d9', // purple-700
          from: '#9333ea', // gradiente: purple-600 (tailwind) -> indigo
          to: '#4f46e5', // indigo-600
          soft: '#a78bfa', // purple-400 (texto/ícone sobre fundo escuro)
          subtle: 'rgba(124, 58, 237, 0.15)',
          foreground: '#ffffff',
        },
        surface: {
          DEFAULT: '#020617', // slate-950 (fundo da página)
          raised: '#0f172a', // slate-900 (cards)
          overlay: '#1e293b', // slate-800 (hover, controles)
        },
        border: {
          DEFAULT: '#1e293b', // slate-800
          strong: '#334155', // slate-700
        },
        fg: {
          DEFAULT: '#f1f5f9', // slate-100
          muted: '#94a3b8', // slate-400 (mínimo para texto secundário sobre surface)
        },
        muted: '#94a3b8',
        danger: { DEFAULT: '#f43f5e', soft: '#fda4af', subtle: 'rgba(244, 63, 94, 0.12)' },
        warning: { DEFAULT: '#f59e0b', soft: '#fcd34d', subtle: 'rgba(245, 158, 11, 0.12)' },
        success: { DEFAULT: '#10b981', soft: '#6ee7b7', subtle: 'rgba(16, 185, 129, 0.12)' },
        info: { DEFAULT: '#38bdf8', soft: '#7dd3fc', subtle: 'rgba(56, 189, 248, 0.12)' },
      },
      borderRadius: {
        card: '1rem', // rounded-2xl
        control: '0.75rem', // rounded-xl
      },
      boxShadow: {
        card: '0 1px 2px rgba(2, 6, 23, 0.4)',
        overlay: '0 20px 50px -12px rgba(2, 6, 23, 0.8)',
        glow: '0 0 25px -5px rgba(124, 58, 237, 0.3)',
      },
      ringColor: { focus: '#a78bfa' },
    },
  },
  plugins: [],
};
