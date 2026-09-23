import EpicCard from '../components/EpicCard';
import Section from '../components/Section';
import { EPICS } from '../meta';
import { childProjects, epics } from '../registry';

export default function Epics() {
  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 mb-3 text-faint">/epics</p>
        <h1 className="page-title max-w-[20ch]">Epics</h1>
        <p className="mt-5.5 mb-0 max-w-[52ch] text-muted">{EPICS.description}</p>
      </section>

      <Section label="all epics">
        {epics.length === 0 ? (
          <p className="mono-sm m-0 text-faint">No epics registered yet.</p>
        ) : (
          <div className="grid gap-5">
            {epics.map((epic) => (
              <EpicCard key={epic.path} epic={epic} projects={childProjects(epic.slug)} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
