/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dual Pantone palette via CSS vars:
        // Light → Cerulean cool blue-gray (:root)
        // Dark  → warm greige (.dark)
        slate: {
          50:  'rgb(var(--slate-50)  / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        // Warm accent — Pantone 16-1546 "Peach Cobbler" inspired
        primary: {
          50:  '#FFF5EE',
          100: '#FFE8D5',
          200: '#FFCFAA',
          300: '#FFB07E',
          400: '#FF8F52',
          500: '#E8703A',
          600: '#C4542A',
          700: '#9A3D1D',
          800: '#702B13',
          900: '#4A1C0C',
          950: '#2E0F05',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}