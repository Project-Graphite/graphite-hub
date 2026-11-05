import { PageHero } from '../components/kit/page';
import { Page } from '../components/Shell';

const KEPT = [
  [
    'Visitors',
    'No cookies, no accounts, no advertising and no third-party scripts. Pages render for anyone without signing in.',
  ],
  [
    'Addresses',
    'Used only to limit how often a sign-in can be tried, and kept for at most ten minutes.',
  ],
  [
    'Members',
    'A signed-in session lasts seven days idle and can be ended by its owner or the site owner at any time.',
  ],
  [
    'Errors',
    'An error report keeps the route and a request id, never what was sent, for thirty days after it was last seen.',
  ],
  ['Uptime', 'Checks of each project, minute by minute for thirty days, then one line a day.'],
  [
    'Activity',
    'Public events such as deploys and releases; deploys and releases stay, the rest for 180 days.',
  ],
];

export default function Privacy() {
  return (
    <Page>
      <PageHero crumb="/privacy" title="What this site keeps">
        <p className="lede">
          Project Graphite is a portfolio. It keeps as little as it needs, for as short a time as it
          can.
        </p>
      </PageHero>
      <dl className="band grid max-w-[64ch] grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-4">
        {KEPT.map(([what, how]) => (
          <div key={what} className="contents">
            <dt className="mono-sm text-faint">{what}</dt>
            <dd className="text-muted">{how}</dd>
          </div>
        ))}
      </dl>
    </Page>
  );
}
