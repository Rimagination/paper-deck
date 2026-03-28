/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Noto Sans SC", "sans-serif"],
        heading: ["Space Grotesk", "IBM Plex Sans", "Noto Sans SC", "sans-serif"],
        "heading-cn": ["Source Han Serif SC", "Noto Serif SC", "Songti SC", "STSong", "serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      animation: {
        "card-flip": "cardFlip 0.6s ease-in-out forwards",
        "card-glow": "cardGlow 2s ease-in-out infinite alternate",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
      },
      keyframes: {
        cardFlip: {
          "0%": { transform: "perspective(1000px) rotateY(0deg)" },
          "100%": { transform: "perspective(1000px) rotateY(180deg)" },
        },
        cardGlow: {
          "0%": { boxShadow: "0 0 8px rgba(251,191,36,0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(251,191,36,0.6)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
