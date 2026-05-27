/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './context/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        s0:  'var(--s0)',
        s0h: 'var(--s0h)',
        s1:  'var(--s1)',
        s2:  'var(--s2)',
        s3:  'var(--s3)',
        l1:  'var(--l1)',
        l2:  'var(--l2)',
        l3:  'var(--l3)',
        l4:  'var(--l4)',
        sep: 'var(--sep)',
        agreen:  'rgb(var(--agreen-rgb) / <alpha-value>)',
        ablue:   'rgb(var(--ablue-rgb)  / <alpha-value>)',
        apurple: 'rgb(var(--apurple-rgb)/ <alpha-value>)',
        ared:    'rgb(var(--ared-rgb)   / <alpha-value>)',
        aorange: 'rgb(var(--aorange-rgb)/ <alpha-value>)',
        ayellow: 'rgb(var(--ayellow-rgb)/ <alpha-value>)',
      },
    },
  },
  plugins: [],
}
