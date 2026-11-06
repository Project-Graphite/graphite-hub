import { useId, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { useHub } from '../../hub';
import { useMagnetic } from '../../motion/motion';
import { describeChoice, scopeKey, type Cadence, type Scope } from '../../subscribe';
import { accentStyle, Avatar, Panel } from './basics';
import { Chips } from './directory';

type Outcome = { sent: true } | { reason: string };

export function SubscribeForm({
  scope,
  cadence,
  compact = false,
  action = '/subscribe',
}: {
  scope: Scope;
  cadence: Cadence;
  compact?: boolean;
  action?: string;
}) {
  const fetcher = useFetcher<Outcome>();
  const magnetic = useMagnetic<HTMLButtonElement>();
  const id = useId();
  const sent = fetcher.data && 'sent' in fetcher.data;
  const reason = fetcher.data && 'reason' in fetcher.data ? fetcher.data.reason : null;
  return (
    <fetcher.Form
      method="post"
      action={action}
      className={`subscribe-form ${compact ? 'compact' : ''}`}
      data-sent={sent || undefined}
    >
      <input type="hidden" name="intent" value="subscribe" />
      <input type="hidden" name="scope" value={scopeKey(scope)} />
      <input type="hidden" name="cadence" value={cadence} />
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px]"
      />
      {sent ? (
        <p className="sent">
          <i />
          check your inbox to confirm
        </p>
      ) : (
        <>
          <label htmlFor={id} className="sr-only">
            Email address
          </label>
          <input
            id={id}
            type="email"
            name="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="you@somewhere.com"
            className="field"
          />
          <button
            ref={magnetic}
            type="submit"
            className="btn primary"
            disabled={fetcher.state !== 'idle'}
          >
            subscribe <span className="arrow">→</span>
          </button>
        </>
      )}
      {reason && <p className="mono-sm text-danger reason">{reason}</p>}
    </fetcher.Form>
  );
}

export function SubscribePanel({ scope, title = 'by email' }: { scope: Scope; title?: string }) {
  const hub = useHub();
  return (
    <Panel title={title} link={{ to: '/subscribe', label: 'choose' }}>
      <p className="intro">{describeChoice(scope, 'each', hub)}, in your inbox.</p>
      <SubscribeForm scope={scope} cadence="each" compact />
    </Panel>
  );
}

const KINDS = [
  ['all', 'everything'],
  ['project', 'a project'],
  ['member', 'a member'],
] as const;

export function Chooser({
  scope,
  cadence,
  onScope,
  onCadence,
}: {
  scope: Scope;
  cadence: Cadence;
  onScope: (next: Scope) => void;
  onCadence: (next: Cadence) => void;
}) {
  const hub = useHub();
  const [lastProject, setLastProject] = useState(
    scope.kind === 'project' ? scope.slug : hub.projects[0]?.slug,
  );
  const [lastMember, setLastMember] = useState(
    scope.kind === 'member' ? scope.handle : hub.members[0]?.handle,
  );
  const pickKind = (kind: Scope['kind']) => {
    if (kind === 'all') {
      onScope({ kind });
    } else if (kind === 'project' && lastProject) {
      onScope({ kind, slug: lastProject });
    } else if (kind === 'member' && lastMember) {
      onScope({ kind, handle: lastMember });
    }
  };
  const sentence = describeChoice(scope, cadence, hub);

  return (
    <div className="chooser">
      <div className="kinds" role="group" aria-label="What to follow">
        {KINDS.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className="kind-card"
            aria-pressed={scope.kind === kind}
            disabled={
              (kind === 'project' && hub.projects.length === 0) ||
              (kind === 'member' && hub.members.length === 0)
            }
            onClick={() => pickKind(kind)}
          >
            <span className="glyph" aria-hidden="true">
              {kind === 'all' ? '∗' : kind === 'project' ? '▣' : '◉'}
            </span>
            <strong>{label}</strong>
          </button>
        ))}
      </div>
      {scope.kind === 'project' && (
        <Chips
          label="Which project"
          value={scope.slug}
          onChange={(slug) => {
            setLastProject(slug);
            onScope({ kind: 'project', slug });
          }}
          choices={hub.projects.map((project) => ({
            id: project.slug,
            label: project.name,
            count: hub.postsAbout(project).length || undefined,
          }))}
        />
      )}
      {scope.kind === 'member' && (
        <div className="faces" role="group" aria-label="Which member">
          {hub.members.map((member) => (
            <button
              key={member.handle}
              type="button"
              className="face-pick"
              aria-pressed={scope.handle === member.handle}
              aria-label={member.name}
              style={accentStyle(member.accent)}
              onClick={() => {
                setLastMember(member.handle);
                onScope({ kind: 'member', handle: member.handle });
              }}
            >
              <Avatar member={member} size="md" />
              <span>{member.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="cadence">
        <span className="choice" role="group" aria-label="How often">
          <label>
            <input
              type="radio"
              name="cadence-pick"
              value="each"
              checked={cadence === 'each'}
              onChange={() => onCadence('each')}
            />
            each post
          </label>
          <label>
            <input
              type="radio"
              name="cadence-pick"
              value="weekly"
              checked={cadence === 'weekly'}
              onChange={() => onCadence('weekly')}
            />
            weekly digest
          </label>
        </span>
        <p key={sentence} className="sentence">
          You will get <b>{sentence}</b>.
        </p>
      </div>
    </div>
  );
}

export function SubscribeLink() {
  return (
    <Link to="/subscribe" className="rule-link mono-sm">
      choose what you get
    </Link>
  );
}
