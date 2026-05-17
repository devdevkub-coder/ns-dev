import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        scrap: {
          ink: '#172033',
          muted: '#64748b',
          line: '#d9e2ec',
          panel: '#f8fafc',
          accent: '#0f766e',
        },
      },
    },
  },
  plugins: [],
}

export default config
