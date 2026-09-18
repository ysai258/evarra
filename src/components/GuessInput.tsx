import { useId, useMemo, useRef, useState } from 'react';
import { searchCelebrities } from '../engine/normalize.ts';
import type { Celebrity } from '../engine/types.ts';

type GuessInputProps = {
  celebrities: readonly Celebrity[];
  disabled: boolean;
  attemptsLeft: number;
  /**
   * The chosen star comes through alongside its name. The daily game only needs the
   * name, but multiplayer sends an id over the wire, and re-deriving one from the
   * other would break the moment two stars share a display name.
   */
  onGuess: (name: string, celebrity: Celebrity) => void;
  /** Overrides the attempts-based label for modes that do not count attempts. */
  ariaLabel?: string;
  placeholder?: string;
};

const MAX_SUGGESTIONS = 7;

const ROLE: Record<Celebrity['category'], string> = {
  actor: 'Actor',
  actress: 'Actress',
  director: 'Director',
  composer: 'Music director',
  character: 'Actor',
};

/**
 * A searchable selector rather than free text (PRD §7): the player should never lose
 * an attempt to a spelling mistake. Implements the ARIA combobox pattern so it works
 * with a keyboard and a screen reader as well as a thumb.
 */
export function GuessInput({
  celebrities, disabled, attemptsLeft, onGuess, ariaLabel, placeholder,
}: GuessInputProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const suggestions = useMemo(
    () => searchCelebrities(query, celebrities, MAX_SUGGESTIONS),
    [query, celebrities],
  );

  const showList = open && query.trim().length > 0;

  function choose(celebrity: Celebrity | undefined) {
    if (!celebrity || disabled) return;
    onGuess(celebrity.name, celebrity);
    setQuery('');
    setOpen(false);
    setActive(0);
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList || suggestions.length === 0) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="guess">
      {showList && (
        <ul className="guess__list" id={listId} role="listbox" aria-label="Matching celebrities">
          {suggestions.length === 0 ? (
            <li className="guess__empty">No star matches “{query.trim()}”.</li>
          ) : (
            suggestions.map((celebrity, index) => (
              <li
                key={celebrity.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className="guess__option"
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  // mousedown, not click: blur would close the list first.
                  event.preventDefault();
                  choose(celebrity);
                }}
              >
                <em>{celebrity.name}</em>
                <span>{ROLE[celebrity.category]}</span>
              </li>
            ))
          )}
        </ul>
      )}

      <div className="guess__field">
        <span aria-hidden="true">🔍</span>
        <input
          ref={inputRef}
          className="guess__input"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && suggestions.length > 0 ? `${listId}-${active}` : undefined}
          aria-label={ariaLabel
            ?? `Guess the celebrity. ${attemptsLeft} ${attemptsLeft === 1 ? 'guess' : 'guesses'} left.`}
          placeholder={placeholder ?? 'Search a Telugu star…'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="go"
          disabled={disabled}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="guess__clear"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
