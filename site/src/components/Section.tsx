import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
}

export default function Section({ label, children }: Props) {
  return (
    <section className="mt-10 border-t border-line-soft pt-7">
      <h2 className="mono-sm m-0 mb-6 font-normal text-faint">{label}</h2>
      {children}
    </section>
  );
}
