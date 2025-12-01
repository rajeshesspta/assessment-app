import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import forms from '@tailwindcss/forms';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Inter var', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        sunrise: {
          50: '#fffdf7',
          100: '#fff5eb',
          200: '#ffe3cc',
          300: '#ffd0aa',
          400: '#ffb278',
          500: '#ff9850',
        },
      },
      boxShadow: {
        glow: '0 30px 60px rgba(249, 115, 22, 0.25)',
      },
    },
  },
  plugins: [forms],
};

export default config;
