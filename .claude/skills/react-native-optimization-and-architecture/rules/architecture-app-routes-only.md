---
title: Keep src/app as Routes and Composition Only
impact: HIGH
impactDescription: prevents business logic leaking into the routing layer
tags: architecture, routing, expo-router, composition
---

## Keep src/app as Routes and Composition Only

`src/app/` (Expo Router) is the **routing/composition** layer. It should contain:

- Route files (screens registered with the router).
- Layout shells (`_layout.tsx`).
- Screen wiring — mounting module screens, passing route params, mounting global modals.

It must **not** contain:

- Feature UI (lives in `src/modules/<feature>/screens/`).
- Business logic, state, or data fetching (lives in module hooks/services).
- Component definitions that are reused — those belong to a module or `src/shared/`.

**Incorrect (route file owns the feature):**

```tsx
// src/app/(tabs)/recipes/index.tsx
import { useRecipeSearch } from '@/libs/queries/recipe.query'

export default function RecipesScreen() {
  const [search, setSearch] = useState('')
  const query = useRecipeSearch(search)
  const allRecipes = useMemo(
    () => query.data?.pages.flatMap(p => p.recipes) ?? [],
    [query.data],
  )
  // …200 lines of UI, hooks, handlers, JSX…
  return <View>…</View>
}
```

This route file owns state, fetching, and UI — the feature can't be reused elsewhere, can't be tested without the router, and the file becomes unmaintainable.

**Correct (route file composes a module screen):**

```tsx
// src/app/(tabs)/recipes/index.tsx
import { RecipesScreen } from '@/modules/recipes'

export default function RecipesRoute() {
  return <RecipesScreen />
}
```

```tsx
// src/modules/recipes/screens/RecipesScreen.tsx
import { useRecipesScreen } from '../hooks/useRecipesScreen'

export function RecipesScreen() {
  const { recipes, query, debouncedSetSearch } = useRecipesScreen()
  return <View>…</View>
}
```

The route file should be small enough to scan in one glance. Most route files end up as a single-line render of a module screen, with maybe a `<Stack.Screen options={…} />` for header config.

**Allowed in route files:**

- Mounting a module screen.
- Reading route params and passing them as props.
- Stack/tab `options` configuration.
- Mounting global modals/providers in `_layout.tsx`.

If the route file is growing past those concerns, push the work into a module.
