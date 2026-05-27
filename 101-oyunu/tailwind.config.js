/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      boxShadow: {
        'glow-green': '0 0 24px rgba(34,197,94,0.25)',
        'glow-sky': '0 0 24px rgba(56,189,248,0.25)',
        'glow-amber': '0 0 24px rgba(245,158,11,0.25)',
      },
    },
  },
  plugins: [],
}
