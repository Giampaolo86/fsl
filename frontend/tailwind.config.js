/** @type {import('tailwindcss').Config} */
module.exports = {
  blocklist: ["overline"],
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    container: { center: true, padding: "24px", screens: { "2xl": "1488px" } },
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', "Arial Narrow", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { 950: "#03131F" },
        navy: { 900: "#041E32", 800: "#072B47", 700: "#0B3A5E" },
        fsl: {
          blue: "#0B57D9",
          "blue-light": "#1778FF",
          gold: "#F4AE2B",
          "gold-dark": "#D88913",
          white: "#F5F7FA",
          slate: "#A8BACB",
          success: "#66B847",
          warning: "#F0A31A",
          danger: "#E54835",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: { lg: "12px", md: "8px", sm: "6px", xl: "16px" },
      boxShadow: {
        card: "0 8px 24px -12px rgba(3, 19, 31, 0.7), 0 1px 0 rgba(245,247,250,0.04) inset",
        elev: "0 16px 40px -16px rgba(3, 19, 31, 0.9)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        rise: { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        rise: "rise 0.45s cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
