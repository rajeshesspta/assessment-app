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
          50: '#eef2ff',
          100: '#dfe1ff',
          200: '#c7c8ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        midnight: {
          50: '#f4f6fb',
          100: '#dfe4f8',
          200: '#bfc8ef',
          500: '#1f2847',
          600: '#141a30',
          700: '#0f1423',
          900: '#090b12',
        },
      },
      boxShadow: {
        glow: '0 20px 45px rgba(15, 20, 35, 0.45)',
      },
    },
  },
  plugins: [forms],
};

export default config;
