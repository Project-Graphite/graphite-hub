import { useEffect, useState, type ReactNode } from 'react';

export function Switch({ on, label, toggle }: { on: boolean; label: string; toggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="switch"
      onClick={toggle}
    >
      <i />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  choose,
  label,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  choose: (next: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([id, name]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => choose(id)}>
          {name}
        </button>
      ))}
    </div>
  );
}

export function Confirm({
  label,
  sure = 'sure?',
  act,
  disabled = false,
  className = 'chip-button',
}: {
  label: string;
  sure?: string;
  act: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) {
      return;
    }
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      data-armed={armed || undefined}
      disabled={disabled}
      onClick={() => {
        setArmed(!armed);
        if (armed) {
          act();
        }
      }}
    >
      {armed ? sure : label}
    </button>
  );
}

export function moved<T>(items: T[], from: number, to: number) {
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export function Sortable<T>({
  items,
  keyOf,
  labelOf,
  dimmed,
  reorder,
  children,
}: {
  items: T[];
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  dimmed?: (item: T) => boolean;
  reorder: (next: T[]) => void;
  children: (item: T, index: number) => ReactNode;
}) {
  const [armed, setArmed] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const end = () => {
    setArmed(null);
    setDragging(null);
    setOver(null);
  };
  return (
    <ol className="order">
      {items.map((item, index) => (
        <li
          key={keyOf(item)}
          draggable={armed === index}
          tabIndex={0}
          aria-label={`${labelOf(item)}, position ${index + 1} of ${items.length}`}
          data-off={dimmed?.(item) || undefined}
          data-dragging={dragging === index || undefined}
          data-over={
            over === index && dragging !== null && dragging !== index
              ? dragging < index
                ? 'after'
                : 'before'
              : undefined
          }
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            setDragging(index);
          }}
          onDragOver={(event) => {
            if (dragging !== null) {
              event.preventDefault();
              setOver(index);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging !== null && dragging !== index) {
              reorder(moved(items, dragging, index));
            }
            end();
          }}
          onDragEnd={end}
          onKeyDown={(event) => {
            const to = { ArrowUp: index - 1, ArrowDown: index + 1 }[event.key];
            if (
              event.altKey &&
              event.target === event.currentTarget &&
              to !== undefined &&
              to >= 0 &&
              to < items.length
            ) {
              event.preventDefault();
              reorder(moved(items, index, to));
            }
          }}
        >
          <span
            className="grip"
            aria-hidden="true"
            onPointerDown={() => setArmed(index)}
            onPointerUp={() => setArmed(null)}
          />
          {children(item, index)}
        </li>
      ))}
    </ol>
  );
}
