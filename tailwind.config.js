/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        // You can extend Tailwind's default color palette here
        // based on the twColors object in your original script if needed
        // For example:
        // slate: { 50: '#f8fafc', 100: '#f1f5f9', ..., 900: '#0f172a' },
      }
    },
  },
  plugins: [],
}
