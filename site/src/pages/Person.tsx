import { useParams } from 'react-router-dom';
import ProjectCard from '../components/ProjectCard';
import { personByHandle, projectsOwnedBy } from '../registry';
import NotFound from './NotFound';

export default function Person() {
  const { handle } = useParams();
  const person = handle ? personByHandle(handle) : undefined;

  if (!person) {
    return <NotFound />;
  }

  const owned = projectsOwnedBy(person.handle);

  return (
    <>
      <section className="pt-[88px] pb-5">
        <p className="m-0 font-mono text-[0.82em] text-faint">/{person.handle}</p>
        <h1 className="mt-3 mb-0 max-w-[18ch] text-[clamp(1.9rem,4.6vw,2.8rem)] leading-[1.1] font-[640] tracking-[-0.036em]">
          {person.name}
        </h1>
        {person.headline && <p className="mt-3 mb-0 text-muted">{person.headline}</p>}
        {person.bio && <p className="mt-5 mb-0 max-w-[56ch] text-muted">{person.bio}</p>}

        <div className="mt-6 flex flex-wrap gap-x-[18px] gap-y-2 font-mono text-[0.82em]">
          {person.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              className="border-b border-line pb-px text-ink no-underline hover:border-ink"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </section>

      {owned.length === 0 ? (
        <p className="mt-10 border-t border-line-soft pt-16 font-mono text-[0.82em] text-faint">
          Nothing registered under this name yet.
        </p>
      ) : (
        <div className="mt-8 border-t border-line-soft">
          {owned.map((project) => (
            <ProjectCard key={project.path} project={project} />
          ))}
        </div>
      )}
    </>
  );
}
