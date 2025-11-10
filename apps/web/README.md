# apps/web UI tidy notes

## What changed in this first pass

- Introduced a shared `Container` primitive (max-w-6xl, responsive gutters) so the header, hero, and footer all align to a single centered column instead of hard-coded `max-w-5xl` wrappers.
- Added a `Typography` helper with `title`, `body`, and `label` variants so key copy uses consistent font size, line-height, and contrast. The hero headline now leverages `title`, the supporting copy uses `body`, and section labels use `label`.
- Tightened header/footer spacing and nav button focus styles while giving the shared `Button` component a brand-visible focus ring that works in both the light nav bar and the dark hero.

## How to use the new primitives

1. Wrap page sections inside `<Container>` to inherit the shared gutters and max width.
2. Use `<Typography variant="title"|"body"|"label" />` wherever you want predictable type scale (hero titles, body paragraphs, badges).
3. Pass focus-visible-friendly classes to `Button` via its `className` or rely on the built-in focus styles for primary/ghost actions.

## TODO for the next pass

1. Extend the global Tailwind tokens (spacing scale, container widths, typography ramp) so the primitives can consume semantic names instead of raw `px` classes.
2. Apply `Container`/`Typography` across the pricing/contact/dashboard screens to keep the rhythm consistent everywhere.
3. Refine responsive padding/breakpoints (360px → 1280px) and document the spacing rules in `apps/web/docs` if more detail is helpful.
