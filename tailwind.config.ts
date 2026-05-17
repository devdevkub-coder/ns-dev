import type { Config } from 'tailwindcss'

export default {
  content: ['./old-apps/vue/index.html', './old-apps/vue/src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        scrap: {
          ink: '#0f172a',
          steel: '#475569',
          copper: '#2563eb',
          mist: '#f1f5f9',
          line: '#e2e8f0',
        },
      },
      fontFamily: {
        sans: ['"Sarabun"', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 1px 3px rgba(15, 23, 42, 0.10)',
      },
    },
  },
  plugins: [],
} satisfies Config
