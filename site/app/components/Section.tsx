import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}

export default function Section({ label, children, action }: Props) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{label}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
