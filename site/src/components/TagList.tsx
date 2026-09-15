interface Props {
  tags: string[];
  className?: string;
}

export default function TagList({ tags, className = '' }: Props) {
  return (
    <ul className={`mono-sm m-0 flex list-none flex-wrap gap-1.5 p-0 ${className}`}>
      {tags.map((tag) => (
        <li key={tag} className="rounded-full border border-line px-2.5 py-0.5 text-faint">
          {tag}
        </li>
      ))}
    </ul>
  );
}
