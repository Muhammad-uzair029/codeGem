---
name: figma-to-code-skill
description: >-
  Build React Native UI code from a Figma design — whether it arrives as a
  figma.com link, a Figma MCP node, a screenshot, or a plain description. Use
  whenever turning a Figma screen, component, or layout into React Native code.
  Enforces relative + flexbox layout (absolute positioning only for genuine
  overlaps), design-token extraction before markup, and reusable components.
  Works in any React Native / Expo repo regardless of its existing code.
---

# Figma → Code (React Native)

Turn a Figma design into working, responsive React Native code. The design may
arrive in **any form** — a link with a `node-id`, a live Figma MCP connection, a
plain screenshot, or a verbal description — and the repo may have any existing
structure. Adapt to what you're given; don't assume the design follows a system
or that the codebase already has tokens/components.

**Before adding anything, match the repo you're in.** Detect its conventions
first — styling approach (`StyleSheet`, styled-components, NativeWind/Tailwind,
Tamagui, Unistyles…), where tokens/theme live, how components are organized, TS
vs JS. Fit those conventions instead of imposing new ones. The rules below are
about *layout correctness and structure*, not a specific stack.

---

## Rule #0 — Layout is relative + flex. Absolute is the exception.

This is the single most important rule and the most common way generated UI goes
wrong.

**Never** read x/y coordinates from Figma and translate them to
`position: 'absolute'` with `top`/`left`. That reproduces one screen size as a
pixel-perfect snapshot and **breaks the moment the screen size changes** — the
natural flow of elements is gone, nothing reflows, and text/containers overlap on
other devices.

**Instead:** reconstruct the Figma **Auto Layout tree** as nested flex
containers. A Figma frame with Auto Layout *is* flexbox — map it directly:

| Figma (Auto Layout)              | React Native style                              |
| -------------------------------- | ----------------------------------------------- |
| Vertical layout                  | `flexDirection: 'column'` (default — omit it)   |
| Horizontal layout                | `flexDirection: 'row'`                          |
| Item spacing / gap               | `gap: N`                                         |
| Padding                          | `padding` / `paddingHorizontal` / `paddingVertical` |
| Align (counter axis)             | `alignItems: 'center' \| 'flex-start' \| 'flex-end'` |
| Distribute (main axis)           | `justifyContent: 'center' \| 'flex-start' \| ...` |
| "Space between"                  | `justifyContent: 'space-between'`               |
| Child **Fill** (main axis)       | `flex: 1`                                        |
| Child **Fill** (counter axis)    | `alignSelf: 'stretch'` or `width: '100%'`       |
| Child **Hug**                    | default — no fixed size, no `flex`              |
| Child **Fixed**                  | explicit `width` / `height`                     |
| Full-bleed child                 | `width: '100%'`                                 |

**Use `position: 'absolute'` ONLY when elements genuinely overlap** and cannot be
expressed by flow:

- a badge/dot pinned to the corner of an avatar or icon
- an overlay, backdrop, modal scrim, floating action button, or toast
- a decorative shape sitting *behind* content
- a node the Figma design explicitly marks "Absolute position" (it opts out of
  Auto Layout on purpose)

Everything else — rows, columns, cards, forms, lists, headers, footers — is flex.

**Pinning to the bottom of a screen** is flex, not absolute: give the container
`flex: 1` and the bottom element `marginTop: 'auto'`. Inside a `ScrollView`, use
`contentContainerStyle={{ flexGrow: 1 }}` so short content still fills the height.

```tsx
// ❌ WRONG — snapshots one screen size, breaks responsiveness
<View style={{ position: 'absolute', top: 220, left: 16 }}>
  <Text style={{ position: 'absolute', top: 0 }}>Email</Text>
</View>

// ✅ RIGHT — reconstructs the Auto Layout tree as flex; reflows everywhere
<View style={{ gap: 10, width: '100%' }}>
  <Text style={styles.label}>Email</Text>
  <View style={styles.inputRow}>{/* row: icon + input */}</View>
</View>
```

Related traps to avoid: hardcoding a device width (`width: 375`) instead of
`'100%'`/`flex`; fixed heights on text containers (let them hug); pixel margins
where a parent `gap` is cleaner.

---

## Rule #1 — Component-oriented: build reusable, never repeat.

Take a **component-oriented approach** to everything you build. The goal is to
write a piece of UI **once** and reuse it — repetition is the thing to eliminate.

- Before building anything, scan the repo for a component that already does the
  job and reuse it. Don't create a second button/input/card that duplicates one
  that exists.
- The moment a visual element appears more than once (buttons, inputs, cards,
  list rows, avatars, chips, badges…), extract it into a **single reusable
  component** with props — do **not** copy-paste markup per instance.
- Model Figma component **variants** as props (`variant`, `state`, `size`,
  `disabled`…), not as separate components.
- Break a screen into small composable pieces (a screen composes sections;
  sections compose components). Keep each component focused on one job.

> Why: one component with props stays consistent everywhere and is fixed in one
> place. Copy-pasted markup drifts and multiplies every future change.

---

## Rule #2 — Never hardcode colors (or any design value). Centralize, then reference.

**Never write a raw color inline** — no `color: '#3D3D3D'`, no `backgroundColor:
'rgba(...)'` in a component. The same applies to font sizes/families, spacing,
and radii. Every design value flows through a central theme. For **every** color
you're about to use:

1. **Check whether a central theme/tokens module already exists** (`theme.ts`,
   `tokens.ts`, a styled-components/Tamagui theme, a Tailwind/NativeWind config, a
   theme context…).
2. **If none exists, create one** — a single small module is enough to start.
3. **Check whether the color is already defined** there. If it is, reuse that
   token. If not, **add it to the central theme** under a semantic name
   (`colors.primary`, `colors.textSecondary`, `colors.border`) — not a raw name
   like `green1`.
4. **Reference the token** from the component (`color: colors.textPrimary`).

A component should never be the place a color first appears. If you find yourself
typing a hex in a component, stop and route it through the theme instead.

---

## Workflow

### 1. See it and map its structure

Read the design before writing a line of code. With the Figma MCP connected:

- **`get_screenshot`** on the target node — always start here for the visual.
- **`get_metadata`** — the node tree (names, types, sizes, nesting). This is your
  scaffold for the component/flex hierarchy.
- **`get_design_context`** (a.k.a. get_code / design context) — detailed layout,
  spacing, colors, text, Auto Layout settings. Read Auto Layout
  direction/gap/padding/alignment here; **ignore raw x/y** except to detect true
  overlaps.
- **`get_variable_defs`** — the file's Variables (color/type/spacing tokens) as
  named values. When present, these map straight onto your theme token names.
- **`get_code_connect_map`** — if a Figma component is already mapped to a code
  component, reuse that component instead of rebuilding it.

**Access caveat:** Figma MCP read tools generally require **edit access** to the
file. A view-only seat can fail with "you don't have edit access to this file." If
MCP can't read it, fall back to a screenshot plus whatever values you can see.

**No MCP / screenshot only:** infer the structure — group by visual proximity into
flex containers, estimate a spacing scale (round to 4/8), sample colors and sizes.
State the assumptions you made so they can be corrected.

### 2. Tokens first — define once, reference everywhere

Before building screens, make sure the design's **colors, typography, spacing, and
radii** live as named tokens in whatever the repo uses for theme (a `theme.ts` /
`tokens.ts`, a styled-components/Tamagui theme, a Tailwind/NativeWind config, a
context, etc.). If the repo has no such place, create one small module and use it.
Components reference tokens — **never** hardcode a hex, font name, or font size
inline.

- Map Figma Variables/Styles → tokens 1:1 by name where possible
  (`color/text/primary` → `colors.textPrimary`, `text/heading/lg` → `type.h1`).
- If the design has no variables (loose hex / ad-hoc sizes), **derive** the
  system: collect distinct colors into semantic names, distinct text roles into
  typography presets, round spacing to a 4/8 scale. Add tokens rather than inlining
  values — even a design that isn't systematized should become one in code.
- Text styles carry `fontFamily`, `fontSize`, `lineHeight`, and `letterSpacing`
  (use px, not %), with `color` bound to a color token — mirror all of them.

### 3. Build the screen as nested flex

- Wrap screens in `SafeAreaView` (from `react-native-safe-area-context`) with the
  appropriate `edges`, and set the status bar style.
- Use a `ScrollView`/`FlatList` for content that can exceed the viewport;
  `keyboardShouldPersistTaps="handled"` for forms.
- One container per Auto Layout frame. Prefer **`gap`** over per-child margins.
- Fills → `width: '100%'` or `flex: 1`; hugs → default sizing; fixed → explicit
  dimensions.
- Compose shared text styles from a typography preset rather than repeating font
  properties per `Text`.
- A brief comment tying a container back to its Figma node id (e.g.
  `{/* header — node 158:330, gap 25 */}`) makes future design diffs traceable.

### 4. Reuse repeated UI as components

Apply **Rule #1** as you build: reuse an existing component if the repo has one;
otherwise extract anything that repeats into a single component with props. Map
Figma component **variants** to props. A Figma file that's already built from
Components with variants tells you exactly where the code component boundaries
are — follow them.

### 5. Icons & assets

- Export/download icons as **SVG** and keep them named consistently; use PNG only
  for raster imagery. Prefer vectors so they scale crisply.
- **Figma SVG gotcha:** exports often use CSS-variable fills like
  `fill="var(--fill-0, #000)"`, which `react-native-svg` can't parse. Flatten them
  to the literal color, e.g.:
  ```bash
  perl -i -pe 's/var\(--[^,]+,\s*([^)]*)\)/$1/g' path/to/icons/*.svg
  ```
- Render SVGs by whatever the repo already uses. Two common approaches:
  - **`react-native-svg-transformer`** — import `.svg` files as components
    (`import Icon from './icon.svg'`); needs Metro/Babel config.
  - **`SvgXml`** from `react-native-svg` — render the SVG string at runtime; no
    bundler config, handy on bleeding-edge RN versions.
- Preserve **`viewBox`** so aspect ratio survives; drive size via width/height,
  and expose `color`/`fill` as a prop if the icon is meant to be recolored.

### 6. Verify responsiveness

- Compare the build against the Figma screenshot.
- Resize mentally (or in a simulator across a small and large device): does
  everything reflow with no overlap and nothing cut off? If it only holds at one
  width, you likely used absolute positioning or a fixed dimension where `flex` /
  `%` was needed.
- **Check versioned docs before unfamiliar APIs.** React Native and Expo change
  fast between versions — confirm the API against the docs for the exact
  RN/Expo version this repo targets rather than relying on memory.

---

## Checklist

- [ ] Matched the repo's existing styling/tokens/component conventions
- [ ] Layout is nested flex reconstructed from Auto Layout — **no `position: 'absolute'`** except real overlaps/overlays
- [ ] No x/y → top/left translation; the UI reflows at other screen sizes
- [ ] No hardcoded device widths or fixed text-container heights
- [ ] Colors, fonts, type sizes, spacing, radii come from named tokens — nothing hardcoded inline
- [ ] Spacing uses `gap`; fills use `width: '100%'` / `flex: 1`; hugs use default sizing
- [ ] Repeated UI is a reusable component with props, not copy-paste
- [ ] SVG icons flattened (no `var(--…)` fills), `viewBox` preserved, rendered the repo's way
- [ ] `SafeAreaView` + status bar + scroll container where appropriate
- [ ] Verified against the screenshot and checked for reflow at multiple sizes
