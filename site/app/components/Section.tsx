import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}

export default function Section({ label, children, action }: Props) {
  return (
    <section className="mt-10 border-t border-line-soft pt-7">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="mono-sm m-0 font-normal text-faint">{label}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
