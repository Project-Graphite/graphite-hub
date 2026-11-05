import { STATUS_LABEL } from '../model';
import type { ProjectStatus } from '../types';

interface Props {
  status: ProjectStatus;
}

export default function Status({ status }: Props) {
  return (
    <span
      className="group inline-flex items-center gap-1.75 text-[0.8rem] whitespace-nowrap text-muted"
      data-status={status}
    >
      <span className="relative flex size-1.75">
        {status === 'live' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60 motion-reduce:animate-none" />
        )}
        <span className="relative size-1.75 rounded-full bg-dormant group-data-[status=live]:bg-live group-data-[status=wip]:bg-wip" />
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}
