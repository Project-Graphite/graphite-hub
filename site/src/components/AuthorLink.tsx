import { Link } from 'react-router-dom';
import { memberByGithub } from '../registry';

interface Props {
  github: string;
  className: string;
}

export default function AuthorLink({ github, className }: Props) {
  const member = memberByGithub(github);

  return member ? (
    <Link to={member.path} className={className}>
      {member.name}
    </Link>
  ) : (
    <a href={`https://github.com/${github}`} className={className}>
      {github} ↗
    </a>
  );
}
