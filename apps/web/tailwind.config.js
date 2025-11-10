const { fontFamily } = require('tailwindcss/defaultTheme');

module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './src/**/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f6ff',
          100: '#dce9ff',
          200: '#bcd6ff',
          300: '#8fb7ff',
          400: '#5a8eff',
          500: '#2f6aff',
          600: '#1b54f5',
          700: '#1142d1',
          800: '#1236a8',
          900: '#132f86',
          DEFAULT: '#1b54f5',
        },
        ink: '#0f172a',
        surface: '#f8fafc',
        accent: '#38bdf8',
        warning: '#facc15',
        success: '#22c55e',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans],
        display: ['Sora', ...fontFamily.sans],
      },
      borderRadius: {
        xl: '1.25rem',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
      boxShadow: {
        card: '0 25px 50px -12px rgba(15, 23, 42, 0.15)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography'), require('@tailwindcss/forms')],
};
