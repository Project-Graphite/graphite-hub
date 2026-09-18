const LABEL: Record<string, string> = {
  live: 'live',
  wip: 'in progress',
  archived: 'archived',
  'source-only': 'source only',
};

interface Props {
  status: string;
}

export default function Status({ status }: Props) {
  return (
    <span
      className="group inline-flex items-center gap-1.75 text-[0.8rem] whitespace-nowrap text-muted"
      data-status={status}
    >
      <span className="size-1.75 rounded-full bg-dormant group-data-[status=live]:bg-live group-data-[status=wip]:bg-wip" />
      {LABEL[status]}
    </span>
  );
}
