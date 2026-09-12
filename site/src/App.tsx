import ProjectCard from './components/ProjectCard';
import data from './data/projects.json';
import type { Project } from './types';
import styles from './App.module.css';

const projects = data as Project[];

export default function App() {
  return (
    <>
      <header className={styles.masthead}>
        <div className={`shell ${styles.mastheadInner}`}>
          <a className={styles.wordmark} href="/">
            Project Graphite
          </a>
          <a className={`${styles.navLink} mono`} href="https://github.com/project-graphite">
            github ↗
          </a>
        </div>
      </header>

      <main className="shell">
        <section className={styles.intro}>
          <h1>Things that get built here, and stay built.</h1>
          <p>
            Every project has its own repository, its own subdomain and a real deployment. The
            diagram on each card is generated from what is actually running, not drawn by hand.
          </p>
        </section>

        {projects.length === 0 ? (
          <p className={`${styles.empty} mono`}>Nothing registered yet.</p>
        ) : (
          <div>
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        )}
      </main>

      <footer className={`shell ${styles.footer}`}>
        <p className="mono">Every project here is registered, built and deployed from one place.</p>
      </footer>
    </>
  );
}
