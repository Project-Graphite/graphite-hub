import { Fact, PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';

const KEPT = [
  {
    what: 'Visitors',
    how: 'No cookies, no accounts, no advertising and no third-party scripts. Pages render for anyone without signing in.',
    kept: 'nothing',
  },
  {
    what: 'Addresses',
    how: 'Used only to limit how often a sign-in can be tried.',
    kept: '10 minutes',
  },
  {
    what: 'Members',
    how: 'A signed-in session can be ended by its owner or the site owner at any time.',
    kept: '7 days idle',
  },
  {
    what: 'Errors',
    how: 'An error report keeps the route and a request id, never what was sent.',
    kept: '30 days after last seen',
  },
  {
    what: 'Messages',
    how: 'What you write and the name you give. The address you wrote from is kept only as a keyed hash, to stop floods.',
    kept: 'until a member deletes it',
  },
  {
    what: 'Uptime',
    how: 'Checks of each project, minute by minute for thirty days, then one line a day.',
    kept: '30 days by the minute',
  },
  {
    what: 'Activity',
    how: 'Public events such as deploys and releases. Deploys and releases stay.',
    kept: '180 days',
  },
];

export default function Privacy() {
  return (
    <Page>
      <PageHeader
        path="/privacy"
        title="What this site keeps"
        facts={
          <>
            <Fact label="cookies" value="none" />
            <Fact label="third-party scripts" value="none" />
            <Fact value={KEPT.length} label="things kept, each with a limit" />
          </>
        }
      />
      <dl className="ledger">
        {KEPT.map(({ what, how, kept }) => (
          <div key={what} className="entry">
            <dt>{what}</dt>
            <dd>{how}</dd>
            <dd className="tag kept">{kept}</dd>
          </div>
        ))}
      </dl>
    </Page>
  );
}
