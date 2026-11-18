import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}

export default function Section({ label, children, action }: Props) {
  return (
    <section className="band section">
      <div className="band-head">
        <h2>{label}</h2>
        <div className="rule" />
        {action}
      </div>
      {children}
    </section>
  );
}
