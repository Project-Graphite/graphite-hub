import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import {
  changelogPath,
  childProjects,
  epics,
  members,
  projectsOwnedBy,
  releasesForProject,
  releasesOwnedBy,
  rootProjects,
} from '../registry';

interface EntryProps {
  to: string;
  label: string;
  count: number;
  nested?: boolean;
}

function Entry({ to, label, count, nested = false }: EntryProps) {
  return (
    <li>
      <NavLink
        to={to}
        end
        className={({ isActive }) =>
          `flex items-baseline justify-between gap-3 rounded-md px-2.5 py-1.5 no-underline transition-colors duration-200 hover:bg-surface hover:text-ink ${nested ? 'pl-5' : ''} ${isActive ? 'bg-surface text-ink' : 'text-muted'}`
        }
      >
        <span>{label}</span>
        <span className="mono-sm text-faint">{count}</span>
      </NavLink>
    </li>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mono-sm m-0 mb-2 px-2.5 font-normal text-faint">{label}</h2>
      <ul className="m-0 grid list-none gap-0.5 p-0 text-[0.94rem]">{children}</ul>
    </div>
  );
}

export default function Browse() {
  const owners = members.filter((member) => projectsOwnedBy(member).length > 0);

  return (
    <nav aria-label="Browse releases" className="grid gap-7">
      {epics.length > 0 && (
        <Group label="epics">
          {epics.flatMap((epic) => [
            <Entry
              key={epic.path}
              to={changelogPath(epic)}
              label={epic.name}
              count={releasesForProject(epic).length}
            />,
            ...childProjects(epic.slug).map((child) => (
              <Entry
                key={child.path}
                to={changelogPath(child)}
                label={child.name}
                count={releasesForProject(child).length}
                nested
              />
            )),
          ])}
        </Group>
      )}

      <Group label="projects">
        {rootProjects.map((project) => (
          <Entry
            key={project.path}
            to={changelogPath(project)}
            label={project.name}
            count={releasesForProject(project).length}
          />
        ))}
      </Group>

      <Group label="owners">
        {owners.map((member) => (
          <Entry
            key={member.path}
            to={changelogPath(member)}
            label={member.name}
            count={releasesOwnedBy(member).length}
          />
        ))}
      </Group>
    </nav>
  );
}
