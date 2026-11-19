const PATHS = {
  arrow: 'M3 8h10M9 4l4 4-4 4',
  back: 'M13 8H3M7 4 3 8l4 4',
  external: 'M6.5 4H12v5.5M12 4l-7.5 7.5',
  close: 'M4 4l8 8M12 4l-8 8',
  chevron: 'M4 6l4 4 4-4',
  drag: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8ZM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  plus: 'M8 3v10M3 8h10',
  undo: 'M4 7h6a3 3 0 0 1 0 6H7M4 7l3-3M4 7l3 3',
  menu: 'M2.5 5h11M2.5 11h11',
  search: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10.5 10.5 14 14',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
