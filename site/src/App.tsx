import { Route, Routes } from 'react-router';
import Shell from './components/Shell';
import Epics from './pages/Epics';
import Index from './pages/Index';
import Member from './pages/Member';
import Members from './pages/Members';
import NotFound from './pages/NotFound';
import Project from './pages/Project';
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
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
