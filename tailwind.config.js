/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        line: { DEFAULT: 'rgb(var(--c-line) / <alpha-value>)', strong: 'rgb(var(--c-line-strong) / <alpha-value>)' },
        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        volt: { DEFAULT: 'rgb(var(--c-volt) / <alpha-value>)', ink: 'rgb(var(--c-volt-ink) / <alpha-value>)' },
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
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
