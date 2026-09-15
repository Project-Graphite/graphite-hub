import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Shell from './components/Shell';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import Person from './pages/Person';
import Project from './pages/Project';
import { legacyProject, personByHandle } from './registry';

function LegacyPersonRedirect() {
  const { handle } = useParams();
  const person = handle ? personByHandle(handle) : undefined;
  return person ? <Navigate to={person.path} replace /> : <NotFound />;
}

function LegacyProjectRedirect() {
  const { handle, slug } = useParams();
  const project = handle && slug ? legacyProject(handle, slug) : undefined;
  return project ? <Navigate to={project.path} replace /> : <NotFound />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Index />} />
        <Route path="members/:handle" element={<Person />} />
        <Route path="projects/:slug" element={<Project />} />
        <Route path=":handle" element={<LegacyPersonRedirect />} />
        <Route path=":handle/:slug" element={<LegacyProjectRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
