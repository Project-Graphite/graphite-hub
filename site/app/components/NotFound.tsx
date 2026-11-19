import { useLocation } from 'react-router';
import { Field, Mark } from '../motion/canvases';
import { Button } from './kit/basics';
import { openSearch } from './kit/Palette';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <section className="hero gate">
      <Field />
      <div>
        <p className="mono-sm mb-4 text-faint">{pathname}</p>
        <h1>Nothing here.</h1>
        <div className="actions">
          <Button to="/" primary arrow>
            home
          </Button>
          <button type="button" className="btn" onClick={openSearch}>
            search <span className="kbd">/</span>
          </button>
        </div>
      </div>
      <div className="mark">
        <Mark text="404" />
      </div>
    </section>
  );
}
