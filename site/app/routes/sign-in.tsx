import { PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';

export default function SignIn() {
  return (
    <Page>
      <PageHeader
        path="/sign-in"
        title="Sign in"
        actions={
          <a className="btn primary" href="/auth/sign-in?return=/">
            sign in with GitHub <span className="arrow">→</span>
          </a>
        }
      />
    </Page>
  );
}
