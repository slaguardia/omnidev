import { heroui } from '@heroui/theme';

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../shared/src/lib/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            pre: {
              padding: 0,
              margin: 0,
              backgroundColor: 'transparent',
            },
            code: {
              padding: 0,
              margin: 0,
              backgroundColor: 'transparent',
            },
            'pre code': {
              padding: 0,
              margin: 0,
              backgroundColor: 'transparent',
            },
            'code::before': {
              content: 'none',
            },
            'code::after': {
              content: 'none',
            },
          },
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        title: ['var(--font-title)'],
      },
      colors: {
        omnidev: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
      animation: {
        'gradient-x': 'gradient-x 15s ease infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center',
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center',
          },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  darkMode: 'class',
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@tailwindcss/typography'),
    heroui({
      themes: {
        light: {
          colors: {
            background: '#FFFFFF',
            foreground: '#0F172A',
            primary: {
              50: '#f0f9ff',
              100: '#e0f2fe',
              200: '#bae6fd',
              300: '#7dd3fc',
              400: '#38bdf8',
              500: '#0ea5e9',
              600: '#0284c7',
              700: '#0369a1',
              800: '#075985',
              900: '#0c4a6e',
              DEFAULT: '#0284c7',
              foreground: '#ffffff',
            },
            secondary: {
              50: '#f8fafc',
              100: '#f1f5f9',
              200: '#e2e8f0',
              300: '#cbd5e1',
              400: '#94a3b8',
              500: '#64748b',
              600: '#475569',
              700: '#334155',
              800: '#1e293b',
              900: '#0f172a',
              DEFAULT: '#475569',
              foreground: '#ffffff',
            },
          },
        },
        dark: {
          colors: {
            background: '#0A0A0E',
            foreground: '#EDEDF0',
            primary: {
              50: '#f0f9ff',
              100: '#e0f2fe',
              200: '#bae6fd',
              300: '#7dd3fc',
              400: '#38bdf8',
              500: '#0ea5e9',
              600: '#0284c7',
              700: '#0369a1',
              800: '#075985',
              900: '#0c4a6e',
              DEFAULT: '#38bdf8',
              foreground: '#001018',
            },
            secondary: {
              50: '#16161C',
              100: '#1E1E25',
              200: '#2E2E38',
              300: '#3E3E4A',
              400: '#5E5E6E',
              500: '#8E8E9E',
              600: '#B8B8C4',
              700: '#D4D4DC',
              800: '#EBEBF0',
              900: '#F6F6F8',
              DEFAULT: '#8E8E9E',
              foreground: '#0A0A0E',
            },
          },
        },
      },
    }),
  ],
};

module.exports = config;
