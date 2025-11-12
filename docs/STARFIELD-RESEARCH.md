# Starfield Research Notes

## Inspiration & References
1. [CSS-Tricks – 3D Parallax Hover Effect](https://css-tricks.com/3d-parallax-hover-effect) – shows how radial pointer falloff creates depth cues without heavy animation, shaping our hotspot intensity.
2. [Codrops – Animated Particles Intersection](https://tympanus.net/Development/AnimatedParticles/) – demonstrates layered semi-transparent particles with varying shimmer, influencing Prism Mist and Quiet Pulse.
3. [CodePen by Hannah Donovan – Subtle Particle Trails](https://codepen.io/hannahdonovan/pen/ExRwBoW) – alpha-decay trails inspired Quiet Pulse’s trailing behavior and micro streaks.
4. [CodePen by Matt West – Grid Hover Lights](https://codepen.io/matt-west/pen/rNWGVoB) – provides a grid-focused hover glow that informed Grid Glow’s quantized lines.
5. [Dribbble – Micro Orbiters concept](https://dribbble.com/shots/15854572-Micro-Orbits) – orbiting dots around a UI element inspired Orbit Trail’s halos.
6. [Medium – Designing with Motion](https://uxplanet.org/designing-with-motion-9b07fda6f73d) – explains resting/interactive states, which guided our subtle defaults and interactive bumps.
7. [CodePen – Chromatic Particle Mist](https://codepen.io/akm2/pen/jkIvr) – tinted circle shimmer influenced Prism Mist’s chromatic layers.
8. [Material Design Motion](https://material.io/design/motion/) – offers guardrails for reduced-motion and engagement emphasis.
9. [CodePen – Ember Feather](https://codepen.io/Nylon66/pen/KKvPGQZ) – ascending glow informed Ember Veil’s vertical streaks and streak micro-events.
10. [CodePen – Particle Orbits](https://codepen.io/campe/pen/vYyEwJ) – orbiting trails near UI elements shaped Orbit Trail’s dots and micro-streak arcs.
11. [CodePen – Clustered Pixel Bloom](https://codepen.io/aleixpol/pen/qBdRNyG) – clustered sparks inspired Pixel Bloom’s concentrated bursts.
12. [CodePen – Misty Glimmer](https://codepen.io/akm2/pen/LMwWjN) – subtle mist with shimmer influenced Prism Mist’s micro-event shimmer.

### Variant mapping
- **Quiet pulse** – References 1 & 3: subtle trails and pointer falloff.
- **Ember veil** – References 6 & 9: warm vertical streaks plus ember streak micro-events.
- **Grid glow** – Reference 4: grid-aligned highlights.
- **Orbit trail** – References 5 & 10: orbit halos and streak arcs.
- **Pixel bloom** – References 3 & 11: clustered pixels and bursts.
- **Prism mist** – References 2, 7, & 12: chromatic mist layering and shimmer.

## Further Reading
- [CSS-Tricks](https://css-tricks.com/) – general parallax explorations.
- [Codrops](https://tympanus.net/codrops/) – advanced particle/hover experiments.
- [Material Design motion guidelines](https://material.io/design/motion/) – philosophy & accessibility.

## Tuning ranges
- `density`: 60–160 stars per layer depending on movement goals; reduce when `prefers-reduced-motion` is active.
- `hoverGain`: 1.0–1.4, with ~1.15 default; keep <1.5 to avoid overt brightness.
- `microEventFrequency`: 0.001–0.004 per millisecond (roughly 2–4 events/sec); use the sandbox knob to drop it further if the effect feels noisy.
- `depthCurve`: `(depth) => 0.25 + depth * 0.75` for general use; adjust exponents for more pronounced parallax in deeper layers.

## Accessibility & performance guardrails
- `prefers-reduced-motion` and the new `reduceMotionOverride` skip RAF loops and micro-events, drawing only one static frame.
- All canvases use `pointer-events: none` so they never intercept mouse/keyboard focus.
- Crossfades are kept under ~420 ms and layering state clears old canvases to avoid window leaks.
- Micro events are rare (~3 events per second) so the CPU impact stays minimal; density is halved when motion is forced off.

## Alternatives considered & rejected
- Rendering via WebGL – more power but heavier setup; canvas2D gives enough control for subtle motion.
- Pure CSS gradients/blur for everything – limited animation options and no hotspot reaction, so insufficient for nav-responsive feedback.
- Particle libraries (tsParticles, particles.js) – too many dependencies and hard to match our keyframe timing, so custom canvas was chosen.

## How to extend
1. Add a new entry to `STARFIELD_VARIANTS` with `behavior`, `colorRamp`, and any extra metadata (e.g., clusters, grid size).
2. Extend `renderVariant` with a new `case` for the behavior and hook into micro-event rendering if needed.
3. Wire the variant into `StarfieldVariantSwitcher` if it needs a new swatch or description.
4. Adjust tuning ranges (density/hoverGain/microEventFrequency) and validate via `/dev/sidebar` and the Playwright capture script.

Link this doc from `docs/STARFIELD.md` under a new “Research notes” subsection.
