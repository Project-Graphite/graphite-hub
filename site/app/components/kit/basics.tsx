import { useId, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useFolded } from '../../folds';
import { Art } from './art';
import { Icon } from './icons';

export const accentStyle = (accent: string | undefined) =>
  ({ '--accent': accent }) as CSSProperties;

const AVATAR = {
  xs: { shown: 20, requested: 40 },
  sm: { shown: 32, requested: 64 },
  md: { shown: 40, requested: 96 },
  lg: { shown: 64, requested: 160 },
  base: { shown: 48, requested: 96 },
};

interface AvatarProps {
  member: { name: string; avatarUrl: string; accent: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  online?: boolean;
}

export function Avatar({ member, size, online = false }: AvatarProps) {
  const { shown, requested } = AVATAR[size ?? 'base'];
  return (
    <span
      className={`avatar ${size ?? ''}`}
      style={accentStyle(member.accent)}
      data-online={online || undefined}
      aria-hidden="true"
    >
      <img
        src={
          member.avatarUrl.startsWith('https://avatars.githubusercontent.com/')
            ? `${member.avatarUrl}${member.avatarUrl.includes('?') ? '&' : '?'}s=${requested}`
            : member.avatarUrl
        }
        alt=""
        width={shown}
        height={shown}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

export function Cover({
  name,
  seed = name,
  accent,
  image,
  priority = false,
}: {
  name: string;
  seed?: string;
  accent: string;
  image?: string | null;
  priority?: boolean;
}) {
  return (
    <div className="cover" style={accentStyle(accent)}>
      {image ? (
        <img
          src={image}
          alt={`Cover of ${name}`}
          width={1280}
          height={640}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
        />
      ) : (
        <Art seed={seed} />
      )}
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
  const className = `btn ${primary ? 'primary' : ''}`;
  return /^https?:/.test(to) ? (
    <a className={className} href={to}>
      {children}
      {arrow && <Icon name="external" />}
    </a>
  ) : (
    <Link className={className} to={to}>
      {children}
      {arrow && <Icon name="arrow" />}
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
        {more && (
          <Link to={more.to} className="more">
            {more.label}
            <Icon name="arrow" />
          </Link>
        )}
        {description}
      </div>
      {children}
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
  const heading = useId();
  return (
    <aside className="panel" aria-labelledby={heading} data-folded={folded || undefined}>
      <div className="panel-head">
        <h2 id={heading}>
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
