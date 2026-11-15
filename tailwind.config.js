/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0d0c',
        panel: '#101412',
        raised: '#161b18',
        line: { DEFAULT: '#232a26', strong: '#333c37' },
        fg: '#e9eeea',
        muted: '#98a39d',
        faint: '#75807a',
        volt: { DEFAULT: '#c8f54a', ink: '#121808' },
        danger: '#ff7b6b',
        gold: '#f0c36a',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        sm: '0 1px 3px hsla(0,0%,0%,.4)',
        md: '0 4px 6px hsla(0,0%,0%,.35)',
        lg: '0 5px 15px hsla(0,0%,0%,.4)',
        xl: '0 10px 24px hsla(0,0%,0%,.45)',
        '2xl': '0 15px 35px hsla(0,0%,0%,.55)',
        glow: '0 0 24px hsla(74,90%,62%,.35)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pop: { '0%': { opacity: '0', transform: 'scale(.97) translateY(8px)' }, '100%': { opacity: '1', transform: 'scale(1) translateY(0)' } },
        fade: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        blink: { '0%,50%': { opacity: '1' }, '51%,100%': { opacity: '0' } },
        drift: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.2,.7,.2,1) both',
        pop: 'pop .35s cubic-bezier(.2,.7,.2,1) both',
        fade: 'fade .25s ease both',
        blink: 'blink 1s steps(1) infinite',
        drift: 'drift 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
