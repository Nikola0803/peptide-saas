import type { Config } from "tailwindcss";

// Color tokens ported 1:1 from the original readdy.ai mockup so the rebuilt
// app matches the approved visual design exactly. Each shade references a
// CSS variable (defined in globals.css) holding raw OKLCH L/C/H components.
function scale(name: string) {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  return Object.fromEntries(
    shades.map((s) => [s, `oklch(var(--${name}-${s}) / <alpha-value>)`])
  );
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: scale("background"),
        foreground: scale("foreground"),
        primary: scale("primary"),
        secondary: scale("secondary"),
        accent: scale("accent"),
      },
      fontFamily: {
        body: ["var(--font-body)"],
        heading: ["var(--font-heading)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
