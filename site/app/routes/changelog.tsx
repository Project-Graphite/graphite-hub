import Browse from '../components/Browse';
import { Panel } from '../components/kit/basics';
import { Page } from '../components/Shell';
import Timeline from '../components/Timeline';
import { CHANGELOG } from '../meta';
import { useHub } from '../hub';

export default function Changelog() {
  const { releases } = useHub();
  return (
    <Page
      rail={
        <Panel title="browse">
          <Browse />
        </Panel>
      }
    >
      <section className="page-hero">
        <p className="mono-sm m-0 mb-3 text-faint">/changelog</p>
        <h1 className="page-title max-w-[20ch]">Changelog</h1>
        <div className="hero-rule mt-5.5 max-w-[52ch]" />
        <p className="mt-5.5 mb-0 max-w-[56ch] text-muted">{CHANGELOG.description}</p>
      </section>

      <Timeline releases={releases} showProject />
    </Page>
  );
}
