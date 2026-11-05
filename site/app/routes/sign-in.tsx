import { useSearchParams } from 'react-router';
import { Avatar, Button } from '../components/kit/basics';
import { Page } from '../components/Shell';
import { useRoot } from '../hub';
import { Field, Mark } from '../motion/canvases';
import { useMagnetic } from '../motion/motion';

export default function SignIn() {
  const root = useRoot();
  const [params] = useSearchParams();
  const wanted = params.get('return') ?? '/';
  const back = /^\/(?!\/)/.test(wanted) ? wanted : '/';
  const magnetic = useMagnetic<HTMLAnchorElement>();
  const viewer = root?.viewer ?? null;
  const member = viewer
    ? root!.directory.members.find(
        (candidate) => candidate.github.toLowerCase() === viewer.login.toLowerCase(),
      )
    : undefined;

  return (
    <Page>
      <section className="hero gate">
        <Field />
        <div>
          <p className="mono-sm mb-4 text-faint">/sign-in</p>
          {viewer ? (
            <>
              <h1>Signed in.</h1>
              <p className="whom">
                {member && <Avatar member={member} size="sm" />}
                <span>{member?.name ?? viewer.login}</span>
                <span className="role">@{viewer.login}</span>
                {viewer.owner && <span className="role">owner</span>}
              </p>
              <div className="actions">
                <Button to={back} primary arrow>
                  continue
                </Button>
                {member && <Button to={member.path}>your page</Button>}
              </div>
            </>
          ) : (
            <>
              <h1>Sign in with GitHub.</h1>
              <div className="actions">
                <a
                  ref={magnetic}
                  className="btn primary"
                  href={`/auth/sign-in?return=${encodeURIComponent(back)}`}
                >
                  sign in <span className="arrow">→</span>
                </a>
                <Button to="/members">the members</Button>
              </div>
            </>
          )}
        </div>
        <div className="mark">
          <Mark />
        </div>
      </section>
    </Page>
  );
}
