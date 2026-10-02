import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CaretDown, CaretLeft, CaretRight, X } from '@phosphor-icons/react';

export function IconButton({ label, shortcut = '', active = false, className = '', size = 'md', children, ...props }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${size} ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      aria-pressed={props['aria-pressed'] ?? (active ? true : undefined)}
      title={shortcut ? `${label} (${shortcut})` : label}
      {...props}
    >
      {children}
    </button>
  );
}

export function Button({ variant = 'default', size = 'md', className = '', children, ...props }) {
  return (
    <button type="button" className={`btn btn--${variant} btn--${size} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Segmented({ value, options, onChange, size = 'md', className = '', label }) {
  return (
    <div className={`segmented segmented--${size} ${className}`} role="radiogroup" aria-label={label}>
      {options.map(([optionValue, optionLabel, Icon, title]) => (
        <button
          key={optionValue}
          type="button"
          role="radio"
          aria-checked={value === optionValue}
          className={value === optionValue ? 'is-active' : ''}
          title={title || (typeof optionLabel === 'string' ? optionLabel : undefined)}
          onClick={() => onChange(optionValue)}
        >
          {Icon && <Icon size={14} />}
          {optionLabel && <span>{optionLabel}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, description }) {
  const id = useId();
  return (
    <label className="switch-row" htmlFor={id}>
      <span className="switch-row__text">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <span className="switch">
        <input id={id} type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

function sectionStorageKey(id) {
  return `pixelwave.section.${id}`;
}

function readOpen(id, fallback) {
  try {
    const stored = window.localStorage.getItem(sectionStorageKey(id));
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

export function Section({ id, title, defaultOpen = true, actions = null, children, badge = null }) {
  const [open, setOpen] = useState(() => (id ? readOpen(id, defaultOpen) : defaultOpen));
  const toggle = () => {
    setOpen((value) => {
      try {
        if (id) window.localStorage.setItem(sectionStorageKey(id), value ? '0' : '1');
      } catch {
        // Section state is a convenience; ignore storage failures.
      }
      return !value;
    });
  };
  return (
    <section className={`section ${open ? 'is-open' : ''}`}>
      <header className="section__header">
        <button type="button" className="section__toggle" aria-expanded={open} onClick={toggle}>
          <CaretDown size={12} className="section__caret" />
          <span>{title}</span>
          {badge !== null && <span className="section__badge">{badge}</span>}
        </button>
        {actions && <div className="section__actions">{actions}</div>}
      </header>
      {open && <div className="section__body">{children}</div>}
    </section>
  );
}

function formatValue(value, step) {
  const decimals = step < 1 ? Math.min(2, String(step).split('.')[1]?.length || 1) : 0;
  return Number(value).toFixed(decimals);
}

// A labeled slider with an editable number and an optional keyframe toggle.
export function PropertyRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  defaultValue,
  onBegin,
  onChange,
  keyframe = null,
  disabled = false,
}) {
  const [draft, setDraft] = useState(null);
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : Number(defaultValue ?? min);
  const progress = Math.min(100, Math.max(0, ((safeValue - min) / (max - min)) * 100));
  const changed = defaultValue !== undefined && Math.abs(safeValue - defaultValue) > step / 2;

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    onBegin?.();
    onChange(parsed);
  };

  return (
    <div className={`prop-row ${disabled ? 'is-disabled' : ''}`}>
      <button
        type="button"
        className={`prop-row__label ${changed ? 'is-changed' : ''}`}
        title={defaultValue !== undefined ? `${label}. Double-click to reset` : label}
        onDoubleClick={() => {
          if (defaultValue === undefined) return;
          onBegin?.();
          onChange(defaultValue);
        }}
      >{label}</button>
      <input
        className="prop-row__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, safeValue))}
        disabled={disabled}
        aria-label={label}
        style={{ '--fill': `${progress}%` }}
        onPointerDown={() => onBegin?.()}
        onKeyDown={(event) => { if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') onBegin?.(); }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="prop-row__value">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label} value`}
          disabled={disabled}
          value={draft ?? formatValue(safeValue, step)}
          onFocus={(event) => { setDraft(formatValue(safeValue, step)); event.target.select(); }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') { setDraft(null); event.currentTarget.blur(); }
          }}
        />
        {unit && <small>{unit}</small>}
      </span>
      {keyframe ? (
        <span className="prop-row__keys">
          {keyframe.state !== 'none' && (
            <button type="button" className="keynav" aria-label={`Previous ${label} keyframe`} onClick={keyframe.onPrevious}><CaretLeft size={10} weight="bold" /></button>
          )}
          <button
            type="button"
            className={`keyframe-toggle is-${keyframe.state}`}
            aria-label={keyframe.state === 'on' ? `Remove ${label} keyframe` : `Add ${label} keyframe`}
            title={keyframe.state === 'on' ? 'Remove keyframe here' : keyframe.state === 'off' ? 'Add keyframe here' : 'Animate: add a keyframe here'}
            onClick={keyframe.onToggle}
          ><span /></button>
          {keyframe.state !== 'none' && (
            <button type="button" className="keynav" aria-label={`Next ${label} keyframe`} onClick={keyframe.onNext}><CaretRight size={10} weight="bold" /></button>
          )}
        </span>
      ) : <span className="prop-row__keys" />}
    </div>
  );
}

export function ColorField({ label, value, onChange, onBegin }) {
  const id = useId();
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <span className="color-field">
        <input
          id={id}
          type="color"
          value={value || '#ffffff'}
          onPointerDown={() => onBegin?.()}
          onChange={(event) => onChange(event.target.value)}
        />
        <span>{String(value || '#ffffff').toUpperCase()}</span>
      </span>
    </div>
  );
}

export function SelectField({ label, value, options, onChange }) {
  const id = useId();
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <span className="select">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
        </select>
        <CaretDown size={11} />
      </span>
    </div>
  );
}

function useDismiss(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  }, [enabled, onClose, ref]);
}

// items: { label, icon, shortcut, onSelect, danger, disabled, checked } or { separator: true } or { heading }
export function Menu({ x, y, items, onClose, minWidth = 200 }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useDismiss(ref, onClose);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
    element.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y]);

  const onKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div className="menu" role="menu" ref={ref} style={{ ...position, minWidth }} onKeyDown={onKeyDown}>
      {items.filter(Boolean).map((item, index) => {
        if (item.separator) return <span key={`sep-${index}`} className="menu__separator" role="separator" />;
        if (item.heading) return <span key={`head-${index}`} className="menu__heading">{item.heading}</span>;
        const Icon = item.icon;
        return (
          <button
            key={item.id || item.label}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            className={`menu__item ${item.danger ? 'is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect?.();
            }}
          >
            <span className="menu__icon">{Icon ? <Icon size={14} /> : item.checked ? '✓' : null}</span>
            <span className="menu__label">{item.label}</span>
            {item.detail && <span className="menu__detail">{item.detail}</span>}
            {item.shortcut && <span className="menu__shortcut">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Popover({ anchorRect, onClose, children, width = 300, align = 'start', className = '' }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  useDismiss(ref, onClose);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !anchorRect) return;
    const rect = element.getBoundingClientRect();
    let left = align === 'end' ? anchorRect.right - rect.width : anchorRect.left;
    let top = anchorRect.bottom + 6;
    if (top + rect.height > window.innerHeight - 8) top = Math.max(8, anchorRect.top - rect.height - 6);
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
    setPosition({ left, top });
  }, [anchorRect, align]);

  return (
    <div
      className={`popover ${className}`}
      ref={ref}
      style={{ width, ...(position || { left: -9999, top: -9999 }) }}
      role="dialog"
    >
      {children}
    </div>
  );
}

export function Dialog({ title, description, onClose, children, footer, width = 480, labelledBy }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const root = ref.current;
    (root?.querySelector('[data-autofocus]') || root?.querySelector('input, select, textarea, .dialog__body button'))?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="dialog-scrim" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId} ref={ref} style={{ width }}>
        <header className="dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </section>
    </div>
  );
}
