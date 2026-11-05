import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { useFolded } from '../../folds';
import { useMagnetic } from '../../motion/motion';

export const accentStyle = (accent: string | undefined) =>
  ({ '--accent': accent }) as CSSProperties;

interface AvatarProps {
  member: { name: string; avatarUrl: string; accent: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function Avatar({ member, size }: AvatarProps) {
  const pixels = size ? { xs: 20, sm: 32, md: 40, lg: 64 }[size] : 48;
  return (
    <span className={`avatar ${size ?? ''}`} style={accentStyle(member.accent)} aria-hidden="true">
      <img src={member.avatarUrl} alt="" width={pixels} height={pixels} loading="lazy" />
    </span>
  );
}

export function Cover({
  name,
  accent,
  image,
}: {
  name: string;
  accent: string;
  image?: string | null;
}) {
  return (
    <div className="cover" style={accentStyle(accent)}>
      {image ? <img src={image} alt="" loading="lazy" /> : <span>{name.slice(0, 2)}</span>}
    </div>
  );
}

interface ButtonProps {
  to: string;
  children: ReactNode;
  primary?: boolean;
  arrow?: boolean;
}

export function Button({ to, children, primary = false, arrow = false }: ButtonProps) {
  const magnetic = useMagnetic<HTMLAnchorElement>();
  const className = `btn ${primary ? 'primary' : ''}`;
  const body = (
    <>
      {children}
      {arrow && <span className="arrow">→</span>}
    </>
  );
  return /^https?:/.test(to) ? (
    <a ref={magnetic} className={className} href={to}>
      {body}
    </a>
  ) : (
    <Link ref={magnetic} className={className} to={to}>
      {body}
    </Link>
  );
}

interface BandProps {
  title: ReactNode;
  description?: ReactNode;
  more?: { to: string; label: string };
  children: ReactNode;
}

export function Band({ title, description, more, children }: BandProps) {
  return (
    <section className="band">
      <div className="band-head">
        <h2>{title}</h2>
        <div className="rule" />
        {description}
      </div>
      {children}
      {more && (
        <div className="band-more">
          <Button to={more.to} arrow>
            {more.label}
          </Button>
        </div>
      )}
    </section>
  );
}

export function Panel({
  title,
  link,
  children,
}: {
  title: string;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  const [folded, toggle] = useFolded(title);
  return (
    <aside className="panel" data-folded={folded || undefined}>
      <div className="panel-head">
        <h2>
          <Fold open={!folded} toggle={toggle}>
            {title}
          </Fold>
        </h2>
        {link && (
          <Link to={link.to} className="rule-link mono-sm">
            {link.label}
          </Link>
        )}
      </div>
      <div className="panel-body" hidden={folded}>
        {children}
      </div>
    </aside>
  );
}

export function Fold({
  open,
  toggle,
  children,
}: {
  open: boolean;
  toggle: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="fold" aria-expanded={open} onClick={toggle}>
      {children}
    </button>
  );
}
