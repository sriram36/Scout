# Self-hosted fonts

The dashboard serves its own fonts instead of using `next/font/google`, whose loader could not be
resolved by Vercel's build. Both families are variable fonts, limited to the Latin and Latin Extended
subsets, from Google Fonts.

| Family | Weights | Files |
|---|---|---|
| Bricolage Grotesque | 500-700 | `bricolage-grotesque-latin.woff2`, `bricolage-grotesque-latin-ext.woff2` |
| Instrument Sans | 400-700 | `instrument-sans-latin.woff2`, `instrument-sans-latin-ext.woff2` |

Both are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org), which allows
redistribution with the project. Sources: https://fonts.google.com/specimen/Bricolage+Grotesque and
https://fonts.google.com/specimen/Instrument+Sans

They are declared with plain `@font-face` rules at the top of `src/app/globals.css`.
