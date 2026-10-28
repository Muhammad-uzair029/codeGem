---
title: Business Logic in Hooks, UI in Screens
impact: HIGH
impactDescription: separates state and behavior from presentation; enables hook reuse and testing
tags: architecture, hooks, separation-of-concerns
---

## Business Logic in Hooks, UI in Screens

Screens are **presentational**: they assemble UI from components and bind values/handlers from hooks. All business logic — data fetching, derivations, mutations, validation, navigation decisions, side effects — belongs in **hooks**.

This makes screens readable end-to-end as JSX, lets the same logic power multiple surfaces (a screen + a modal + a section), and lets logic be tested without mounting a render tree.

**Incorrect (logic embedded in the screen):**

```tsx
// src/modules/recipes/screens/RecipesScreen.tsx
export function RecipesScreen() {
  const [search, setSearch] = useState('')
  const debouncedSet = useDebouncedCallback(setSearch, 500)
  const query = useRecipeSearch(search)
  const allRecipes = useMemo(
    () => query.data?.pages.flatMap(p => p.recipes) ?? [],
    [query.data],
  )

  const handleEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
  }, [query])

  const handleRecipePress = useCallback(
    (recipe: RecipeDetail) => router.push(`${ROUTES.APP.RECIPE_DETAIL}/${recipe.id}`),
    [],
  )

  return (
    <View>
      <SearchBar onChange={debouncedSet} />
      <FlatList
        data={allRecipes}
        renderItem={({ item }) => <RecipeCard {...item} onPress={() => handleRecipePress(item)} />}
        onEndReached={handleEndReached}
      />
    </View>
  )
}
```

The screen does fetching, derivation, debouncing, pagination, and navigation. None of it is reusable.

**Correct (hook owns the logic, screen consumes):**

```tsx
// src/modules/recipes/hooks/useRecipesScreen.ts
export function useRecipesScreen() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const debouncedSetSearch = useDebouncedCallback(setSearch, 500)
  const query = useRecipeSearch(search)

  const recipes = useMemo(
    () => query.data?.pages.flatMap(p => p.recipes) ?? [],
    [query.data],
  )

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage()
  }, [query])

  const onRecipePress = useCallback(
    (recipe: RecipeDetail) => router.push(`${ROUTES.APP.RECIPE_DETAIL}/${recipe.id}`),
    [router],
  )

  return { recipes, query, debouncedSetSearch, onEndReached, onRecipePress }
}
```

```tsx
// src/modules/recipes/screens/RecipesScreen.tsx
export function RecipesScreen() {
  const { recipes, query, debouncedSetSearch, onEndReached, onRecipePress } = useRecipesScreen()

  return (
    <View>
      <SearchBar onChange={debouncedSetSearch} />
      <FlatList
        query={query}
        data={recipes}
        renderItem={({ item }) => <RecipeCard {...item} onPress={() => onRecipePress(item)} />}
        onEndReached={onEndReached}
      />
    </View>
  )
}
```

**Heuristics:**

- A screen file should be mostly JSX with one or two hook calls at the top.
- If you reach for `useState`, `useMemo`, `useEffect`, `useCallback`, mutations, or query hooks alongside a large render tree in the same file — extract a `use<Screen>` hook.
- The hook can return a plain object of `{ values, handlers, query }`. Don't pre-design a clever shape; just return what the screen reads.
- Co-locate the hook with the screen: `src/modules/<feature>/hooks/use<Screen>.ts` next to `src/modules/<feature>/screens/<Screen>.tsx`.
- Cross-screen logic (used by multiple screens in the same module) becomes its own hook in `hooks/`. Used by multiple modules → promote to `src/shared/hooks/`.
