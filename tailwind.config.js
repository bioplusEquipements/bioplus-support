/** @type {import('tailwindcss').Config} */

// Palette semantique : les classes utilitaires (bg-surface, border-line, text-ink...)
// pointent vers des variables CSS definies dans src/index.css. Un seul endroit
// a modifier pour re-teinter l'interface, et aucun code page n'a besoin de changer.
//
// Les variables stockent des canaux RGB bruts ("15 118 110") et non une couleur
// CSS complete : c'est ce qui permet a Tailwind d'appliquer un modificateur
// d'opacite (bg-brand/10) sur ces tokens.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

// Rayons et ombres ne sont pas des couleurs : ils prennent le var() tel quel.
// Passer par rgb() produirait une valeur invalide et le navigateur l'ignorerait.
const raw = (name: string) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), alt: token('surface-alt') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), soft: token('ink-soft'), mute: token('ink-mute') },
        brand: {
          DEFAULT: token('brand'),
          strong: token('brand-strong'),
          soft: token('brand-soft'),
          ink: token('brand-ink')
        }
      },
      borderRadius: {
        card: raw('r-card'),
        ctl: raw('r-ctl')
      },
      boxShadow: {
        lift: raw('shadow-lift'),
        pop: raw('shadow-pop')
      }
    }
  },
  plugins: []
};
