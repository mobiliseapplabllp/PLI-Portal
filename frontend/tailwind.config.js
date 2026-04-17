/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Role accent colours — sidebar header tint per role
        'hr-admin': {
          DEFAULT: '#7c3aed',
          light: '#ede9fe',
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        'final-approver': {
          DEFAULT: '#0891b2',
          light: '#e0f2fe',
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
        },
        // Submission status colours (Meets / Exceeds / Below)
        'status-meets': {
          DEFAULT: '#d97706',
          light: '#fffbeb',
          ring: '#fde68a',
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          600: '#d97706',
          700: '#b45309',
        },
        'status-exceeds': {
          DEFAULT: '#059669',
          light: '#ecfdf5',
          ring: '#a7f3d0',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          600: '#059669',
          700: '#047857',
        },
        'status-below': {
          DEFAULT: '#dc2626',
          light: '#fef2f2',
          ring: '#fecaca',
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          600: '#dc2626',
          700: '#b91c1c',
        },
      },
    },
  },
  plugins: [],
};
