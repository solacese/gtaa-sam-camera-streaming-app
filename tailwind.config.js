/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{svelte,js,ts}'],
  theme: {
    extend: {
      colors: {
        // Greater Toronto Airports Authority / Toronto Pearson palette
        'gtaa-blue': '#0057B8',
        'gtaa-blue-dark': '#00408A',
        'gtaa-blue-deep': '#002451',
        'gtaa-sky': '#4FA8E0',
        'gtaa-sky-light': '#A8D4F2',
        'gtaa-teal': '#00A9CE',
        'gtaa-slate': '#1F2A44',
        'gtaa-ink': '#0A1628',
        'gtaa-bg': '#EFF5FC',
        // Runway/wayfinding accents used for capacity indicators
        'gtaa-amber': '#F2A900',
        'gtaa-red': '#D22630',
        'gtaa-green': '#12A05C'
      },
      fontFamily: {
        'display': ['Poppins', 'system-ui', 'sans-serif'],
        'body': ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
