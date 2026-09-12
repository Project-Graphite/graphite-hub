import { Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import Person from './pages/Person';
import Project from './pages/Project';

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Index />} />
        <Route path=":handle" element={<Person />} />
        <Route path=":handle/:slug" element={<Project />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
