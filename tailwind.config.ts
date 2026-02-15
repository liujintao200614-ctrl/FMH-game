import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"SF Pro Display"', 'system-ui', 'sans-serif']
      },
      colors: {
        'arcade-purple': '#A855F7',
        'arcade-pink': '#F472B6'
      },
      boxShadow: {
        neon: '0 0 30px rgba(168,85,247,0.3)'
      }
    }
  },
  plugins: []
} satisfies Config;
