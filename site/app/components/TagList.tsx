interface Props {
  tags: string[];
  className?: string;
}

export default function TagList({ tags, className = '' }: Props) {
  return (
    <ul className={`tags ${className}`}>
      {tags.map((tag) => (
        <li key={tag} className="tag">
          {tag}
        </li>
      ))}
    </ul>
  );
}
