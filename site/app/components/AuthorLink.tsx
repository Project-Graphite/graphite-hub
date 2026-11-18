import { Link } from 'react-router';
import { useHub } from '../hub';
import { Icon } from './kit/icons';

interface Props {
  github: string;
  className: string;
}

export default function AuthorLink({ github, className }: Props) {
  const member = useHub().memberByGithub(github);

  return member ? (
    <Link to={member.path} className={className}>
      {member.name}
    </Link>
  ) : (
    <a
      href={`https://github.com/${github}`}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {github}
      <Icon name="external" />
    </a>
  );
}
