import { useEffect, useState, type KeyboardEvent } from 'react';

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

const STORAGE_KEY = 'flm:todos';

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Todo =>
        !!t &&
        typeof (t as Todo).id === 'string' &&
        typeof (t as Todo).text === 'string' &&
        typeof (t as Todo).done === 'boolean',
    );
  } catch {
    return [];
  }
}

function saveTodos(todos: Todo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {/* noop */}
}

export function TodoList(): JSX.Element {
  const [todos, setTodos] = useState<Todo[]>(() => loadTodos());
  const [draft, setDraft] = useState('');

  useEffect(() => {
    saveTodos(todos);
  }, [todos]);

  const addTodo = () => {
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, done: false },
    ]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTodo();
    }
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const clearCompleted = () => {
    setTodos((prev) => prev.filter((t) => !t.done));
  };

  const remaining = todos.filter((t) => !t.done).length;
  const hasCompleted = todos.some((t) => t.done);

  return (
    <div className="flex flex-col gap-2" data-testid="todo-list">
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="field-input"
          placeholder="Add a todo…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          data-testid="todo-input"
          aria-label="New todo"
        />
        <button
          className="btn-primary shrink-0 !py-2 !px-3"
          onClick={addTodo}
          disabled={!draft.trim()}
          data-testid="todo-add"
          aria-label="Add todo"
        >
          +
        </button>
      </div>

      {todos.length === 0 ? (
        <p className="text-xs text-neutral-500 px-1 py-2" data-testid="todo-empty">
          No todos yet. Type above and press Enter.
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="todo-items">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 bg-surface-800/50 hover:bg-surface-800 border border-surface-700/40 transition-colors"
              data-testid="todo-item"
              data-done={todo.done}
            >
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-accent-600 cursor-pointer"
                checked={todo.done}
                onChange={() => toggleTodo(todo.id)}
                data-testid="todo-toggle"
                aria-label={`Mark "${todo.text}" as ${todo.done ? 'incomplete' : 'complete'}`}
              />
              <span
                className={`flex-1 text-sm truncate ${
                  todo.done ? 'line-through text-neutral-500' : 'text-neutral-200'
                }`}
                data-testid="todo-text"
              >
                {todo.text}
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-bad text-xs transition-all"
                onClick={() => deleteTodo(todo.id)}
                data-testid="todo-delete"
                aria-label={`Delete "${todo.text}"`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {todos.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1 pt-1">
          <span data-testid="todo-remaining">
            {remaining} remaining · {todos.length} total
          </span>
          {hasCompleted && (
            <button
              className="hover:text-accent-500 transition-colors"
              onClick={clearCompleted}
              data-testid="todo-clear-completed"
            >
              Clear completed
            </button>
          )}
        </div>
      )}
    </div>
  );
}
