import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#1e3a5f',
          600: '#1a3354',
          700: '#162c48',
          800: '#122540',
          900: '#0e1e35',
        }
      }
    }
  },
  plugins: [],
} satisfies Config
