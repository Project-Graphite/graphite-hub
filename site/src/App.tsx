import { Route, Routes } from 'react-router';
import Shell from './components/Shell';
import Changelog from './pages/Changelog';
import Epics from './pages/Epics';
import Index from './pages/Index';
import Member from './pages/Member';
import MemberChangelog from './pages/MemberChangelog';
import Members from './pages/Members';
import NotFound from './pages/NotFound';
import Project from './pages/Project';
import ProjectChangelog from './pages/ProjectChangelog';
import Projects from './pages/Projects';

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
        <Route path="changelog" element={<Changelog />} />
        <Route path="changelog/members/:handle" element={<MemberChangelog />} />
        <Route path="changelog/epics/:parentSlug/:slug" element={<ProjectChangelog />} />
        <Route path="changelog/epics/:slug" element={<ProjectChangelog />} />
        <Route path="changelog/projects/:slug" element={<ProjectChangelog />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
