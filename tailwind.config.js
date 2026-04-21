/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 4%)",
        foreground: "hsl(0 0% 98%)",
        muted: "hsl(0 0% 14%)",
        "muted-foreground": "hsl(0 0% 60%)",
        border: "hsl(0 0% 18%)",
        accent: "hsl(0 0% 98%)",
        "accent-foreground": "hsl(0 0% 4%)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
};
