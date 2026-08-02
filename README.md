# sambeetdesign

Portfolio site for Sambeet Dash. Static HTML + CSS — no build step, no dependencies.

## Structure

```
index.html            landing page
assets/
  styles.css          all styles; design tokens at the top
  logo.svg            geometric mark (circle / triangle / diamond / square)
  icon-arrow.svg      Material "arrow_insert", flipped
  icon-menu.svg       Material "menu"
```

Icons are also inlined as an SVG sprite in `index.html`, so the standalone
`.svg` files are there for reuse rather than being fetched at runtime.

## Source of truth

Built from Figma:

- Desktop — node `6454:2467` (1440 × 1541)
- Mobile — node `6454:2469` (360 × 2123)

Design tokens live at the top of `assets/styles.css` and are redefined once at
the 768px breakpoint. Change a value there rather than in a component rule.

## Deploying

Cloudflare Pages, connected to this repo. No build command; output directory is
the repo root. Pushes to `main` deploy automatically.

## Known placeholders

- Project thumbnails are empty boxes at the designed size
- All four card subtitles read "Strategy builder"
- Tag pills are blank swatches, not real tags
- Every link points at `#` — see the `TODO` comments in `index.html`
- Thumbnails use a fixed `225px` height; switch to `aspect-ratio: 320/225`
  once real images land (see the note in `styles.css` — do not naively pair
  `aspect-ratio` with `min-height`, it overflows narrow viewports)
