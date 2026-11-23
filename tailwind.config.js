/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand accent (logo yellow) for primary actions and the active menu item.
        primary: { DEFAULT: '#FACC15', hover: '#EAB308', light: '#FEF9C3', dark: '#854D0E' },
        danger: { DEFAULT: '#DC2626', hover: '#B91C1C', light: '#FEE2E2', dark: '#991B1B' },
        success: { DEFAULT: '#059669', light: '#D1FAE5', dark: '#065F46' },
        info: { DEFAULT: '#2563EB', light: '#DBEAFE', dark: '#1E40AF' },
        // Navy is the structural colour: sidebar, hero banners, headings.
        navy: { 950: '#070D1F', 900: '#0B1530', 800: '#12204A', 700: '#1C2E63', 600: '#2A3F7E' },
        surface: '#F4F6FB',
        line: '#E5E9F2',
        ink: { DEFAULT: '#0F172A', muted: '#64748B' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.04), 0 4px 16px -4px rgba(15,23,42,.06)',
        lift: '0 2px 4px rgba(15,23,42,.05), 0 14px 32px -8px rgba(15,23,42,.14)',
        pop: '0 12px 40px -6px rgba(15,23,42,.22)',
        glow: '0 6px 20px -6px rgba(234,179,8,.55)',
      },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(.97) translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.2,.7,.2,1) both',
        'scale-in': 'scale-in .22s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .2s ease-out both',
        'slide-in': 'slide-in .28s cubic-bezier(.2,.7,.2,1) both',
        float: 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
