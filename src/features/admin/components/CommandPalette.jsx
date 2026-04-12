import { useEffect, useMemo, useRef, useState } from 'react';
import AppModal from '../../../shared/components/AppModal';

const normalizeText = (value) => String(value || '').toLowerCase();

const getActionKeywords = (action) => [
  action?.id,
  action?.label,
  action?.description,
  action?.shortcut,
  ...(Array.isArray(action?.keywords) ? action.keywords : []),
]
  .map((value) => normalizeText(value))
  .join(' ');

const CommandPalette = ({ open, query, setQuery, actions = [], onClose }) => {
  const inputRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredActions = useMemo(() => {
    const search = normalizeText(query).trim();
    if (!search) return actions;
    return actions.filter((action) => getActionKeywords(action).includes(search));
  }, [actions, query]);

  useEffect(() => {
    if (!open) return;
    const firstEnabledIndex = filteredActions.findIndex((action) => !action?.disabled);
    setActiveIndex(firstEnabledIndex >= 0 ? firstEnabledIndex : 0);
  }, [filteredActions, open]);

  useEffect(() => {
    if (!open) return;
    const node = inputRef.current;
    if (!node) return;
    window.requestAnimationFrame(() => {
      node.focus();
      node.select?.();
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open, setQuery]);

  if (!open) return null;

  const moveActiveIndex = (direction) => {
    if (filteredActions.length === 0) return;
    let nextIndex = activeIndex;
    for (let guard = 0; guard < filteredActions.length; guard += 1) {
      nextIndex = (nextIndex + direction + filteredActions.length) % filteredActions.length;
      if (!filteredActions[nextIndex]?.disabled) {
        setActiveIndex(nextIndex);
        return;
      }
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const action = filteredActions[activeIndex];
      if (!action || action.disabled) return;
      onClose?.();
      void action.onSelect?.();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
    }
  };

  const handleActionSelect = (action) => {
    if (!action || action.disabled) return;
    onClose?.();
    void action.onSelect?.();
  };

  return (
    <AppModal
      open={open}
      title="Command Palette"
      onClose={onClose}
      dialogClassName="command-palette-modal"
      contentClassName="command-palette-shell"
      initialSize={{ width: 760, height: 560 }}
    >
      <div className="command-palette-header">
        <div className="command-palette-heading">
          <span className="command-palette-kicker">Products</span>
          <h3>Command palette</h3>
        </div>
        <span className="command-palette-hint">Ctrl / Cmd + K</span>
      </div>
      <label className="command-palette-search-wrap" htmlFor="command-palette-search">
        <span className="command-palette-search-label">Search actions</span>
        <input
          id="command-palette-search"
          ref={inputRef}
          type="text"
          className="command-palette-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type to filter actions"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
      </label>
      <div className="command-palette-body">
        {filteredActions.length === 0 ? (
          <div className="command-palette-empty">
            <strong>No actions match</strong>
            <span>Try searching for search, edit, add, select, or undo.</span>
          </div>
        ) : (
          <div className="command-palette-list" role="listbox" aria-label="Command palette actions">
            {filteredActions.map((action, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={action.id}
                  type="button"
                  className={`command-palette-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleActionSelect(action)}
                  onMouseEnter={() => setActiveIndex(index)}
                  disabled={Boolean(action.disabled)}
                  role="option"
                  aria-selected={isActive}
                >
                  <span className="command-palette-item-icon" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="command-palette-item-copy">
                    <span className="command-palette-item-label-row">
                      <span className="command-palette-item-label">{action.label}</span>
                      {action.shortcut ? <span className="command-palette-item-shortcut">{action.shortcut}</span> : null}
                    </span>
                    <span className="command-palette-item-description">{action.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default CommandPalette;
