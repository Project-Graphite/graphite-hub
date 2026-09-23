import { Link } from 'react-router-dom';
import { avatarFor } from '../registry';
import type { Member } from '../types';

interface Props {
  member: Member;
}

export default function MemberCard({ member }: Props) {
  return (
    <Link
      to={member.path}
      className="flex items-center gap-4 rounded-lg border border-line-soft bg-surface p-4 text-ink no-underline transition-colors duration-200 hover:border-line"
    >
      <img
        src={avatarFor(member)}
        alt=""
        width={48}
        height={48}
        loading="lazy"
        className="size-12 rounded-full border border-line-soft"
      />
      <span>
        <strong className="block font-semibold">{member.name}</strong>
        <span className="mt-1 block text-sm text-muted">
          {member.headline ?? `@${member.github}`}
        </span>
      </span>
    </Link>
  );
}
