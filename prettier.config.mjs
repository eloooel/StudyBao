/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  arrowParens: 'always',
  plugins: ['prettier-plugin-tailwindcss'],
  // Tailwind v4 is CSS-first, so the plugin needs the stylesheet that holds the tokens.
  tailwindStylesheet: './src/styles/theme.css',
}
