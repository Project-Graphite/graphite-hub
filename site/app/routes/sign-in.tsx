import { PageHero } from '../components/kit/page';
import { Page } from '../components/Shell';

export default function SignIn() {
  return (
    <Page>
      <PageHero crumb="/sign-in" title="Members sign in with GitHub">
        <p className="lede">
          Signing in is for members of the Project Graphite organisation, to edit their pages and
          write. Visitors need nothing.
        </p>
        <div className="actions">
          <a className="btn primary" href="/auth/sign-in?return=/">
            sign in with GitHub <span className="arrow">→</span>
          </a>
        </div>
      </PageHero>
    </Page>
  );
}
