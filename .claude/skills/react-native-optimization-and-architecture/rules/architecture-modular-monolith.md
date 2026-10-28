---
title: Follow Modular Monolith Structure
impact: HIGH
impactDescription: clear feature boundaries, prevents cross-feature coupling, deletable features
tags: architecture, modules, shared, boundaries
---

## Follow Modular Monolith Structure

Organize the codebase as a modular monolith with two top-level concerns under `src/`:

- **`src/modules/<feature>/`** — self-contained feature modules. Each module owns its screens, components, hooks, services, types, stores, and validations for that feature. A module should be deletable without breaking unrelated features.
- **`src/shared/`** — cross-module primitives (UI building blocks, utilities, hooks) used by **two or more** modules.

A module must not import from another module. If two modules need the same thing, promote it to `src/shared/`.

**Incorrect (cross-module coupling):**

```
src/modules/recipes/components/RecipeCard.tsx
src/modules/groceries/screens/GroceryList.tsx
  └── import RecipeCard from '@/modules/recipes/components/RecipeCard'  ❌
```

`groceries` now silently depends on `recipes`. Deleting or refactoring `recipes` will break `groceries`.

**Correct (promote shared primitives):**

```
src/shared/ui/recipe-card/RecipeCard.tsx
src/modules/recipes/screens/RecipeList.tsx
  └── import { RecipeCard } from '@/shared/ui/recipe-card'  ✅
src/modules/groceries/screens/GroceryList.tsx
  └── import { RecipeCard } from '@/shared/ui/recipe-card'  ✅
```

**Rules of thumb for promotion:**

- Used by 1 module → keep it **inside** that module.
- Used by 2+ modules → move to `src/shared/`.
- Don't pre-promote. Move things when the second consumer appears, not before — premature sharing creates coupling and an unclear ownership story.
- If a "shared" file is only ever used by one module after a refactor, demote it back into that module.

**A typical module layout:**

```
src/modules/recipes/
  screens/        ← presentational, mounted by src/app/ routes
  components/     ← module-local UI
  hooks/          ← business logic
  services/       ← API calls
  stores/         ← module-local Zustand/state
  types/
  index.ts        ← public surface of the module
```

Only what is exported from the module's `index.ts` is considered the module's public API — keep that surface small.
