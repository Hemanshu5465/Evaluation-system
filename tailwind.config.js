/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: '#f7f4ee',
        ink: {
          DEFAULT: '#14181f',
          soft: '#3a4250',
          muted: '#6b7482',
        },
        line: '#e4ded2',
        card: '#fffdf9',
        brand: {
          50: '#edf7f4',
          100: '#d3ece5',
          200: '#a7d9cb',
          300: '#6fbfaa',
          400: '#3a9f86',
          500: '#1c8168',
          600: '#136853',
          700: '#115444',
          800: '#0f4438',
          900: '#0c372f',
        },
        ai: {
          50: '#f2effe',
          100: '#e6dffd',
          200: '#cfc2fb',
          300: '#ae98f6',
          400: '#8f6def',
          500: '#7549e3',
          600: '#6333cc',
          700: '#5228a8',
          800: '#452389',
          900: '#3a2071',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,24,31,0.04), 0 8px 24px -12px rgba(20,24,31,0.12)',
        lift: '0 2px 6px rgba(20,24,31,0.06), 0 24px 48px -20px rgba(20,24,31,0.25)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(117,73,227,0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(117,73,227,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(117,73,227,0)' },
        },
        'draw-line': {
          '0%': { strokeDashoffset: '1' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        'draw-line': 'draw-line 0.8s ease-out both',
      },
    },
  },
  plugins: [],
}
