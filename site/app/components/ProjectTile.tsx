import { Link } from 'react-router';
import { useHub } from '../hub';
import { useSpotlight } from '../motion/motion';
import type { Project } from '../types';
import { accentStyle } from './kit/basics';
import Status from './Status';

interface Props {
  project: Project;
}

export default function ProjectTile({ project }: Props) {
  const spot = useSpotlight<HTMLAnchorElement>();
  const owner = useHub().memberByHandle(project.owner);
  return (
    <Link
      ref={spot}
      to={project.path}
      className="node spot"
      style={accentStyle(project.accent ?? owner?.accent)}
    >
      <span className="head">
        <strong>{project.name}</strong>
        <Status status={project.status} />
      </span>
      <span className="summary">{project.summary}</span>
    </Link>
  );
}
