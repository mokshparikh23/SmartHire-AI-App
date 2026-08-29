/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        overlay: {
          bg: 'rgba(0, 0, 0, 0.75)',
          border: 'rgba(255, 255, 255, 0.1)',
          text: '#ffffff',
          accent: '#6366f1',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
}
