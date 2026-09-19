import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Shell from './components/Shell';
import Epics from './pages/Epics';
import Index from './pages/Index';
import Member from './pages/Member';
import Members from './pages/Members';
import NotFound from './pages/NotFound';
import Project from './pages/Project';
import Projects from './pages/Projects';
import { legacyProject, memberByLegacyPath } from './registry';

function LegacyMemberRedirect() {
  const { handle } = useParams();
  const member = handle ? memberByLegacyPath(`/${handle}`) : undefined;
  return member ? <Navigate to={member.path} replace /> : <NotFound />;
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
        <Route path="members" element={<Members />} />
        <Route path="members/:handle" element={<Member />} />
        <Route path="epics" element={<Epics />} />
        <Route path="epics/:parentSlug/:slug" element={<Project />} />
        <Route path="epics/:slug" element={<Project />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:slug" element={<Project />} />
        <Route path=":handle" element={<LegacyMemberRedirect />} />
        <Route path=":handle/:slug" element={<LegacyProjectRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
