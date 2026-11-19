import { STATUS_LABEL } from '../model';
import type { ProjectStatus } from '../types';

interface Props {
  status: ProjectStatus;
}

export default function Status({ status }: Props) {
  return (
    <span className="project-status" data-status={status}>
      <i />
      {STATUS_LABEL[status]}
    </span>
  );
}
