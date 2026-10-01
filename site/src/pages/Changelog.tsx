import Timeline from '../components/Timeline';
import { CHANGELOG } from '../meta';
import { releases } from '../registry';

export default function Changelog() {
  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 mb-3 text-faint">/changelog</p>
        <h1 className="page-title max-w-[20ch]">Changelog</h1>
        <div className="hero-rule mt-5.5 max-w-[52ch]" />
        <p className="mt-5.5 mb-0 max-w-[56ch] text-muted">{CHANGELOG.description}</p>
      </section>

      <Timeline releases={releases} showProject />
    </>
  );
}
