import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('members', 'routes/members.tsx'),
  route('members/:handle', 'routes/member.tsx'),
  route('epics', 'routes/epics.tsx'),
  route('epics/:parentSlug/:slug', 'routes/project.tsx', { id: 'epic-project' }),
  route('epics/:slug', 'routes/project.tsx', { id: 'epic' }),
  route('projects', 'routes/projects.tsx'),
  route('projects/:slug', 'routes/project.tsx'),
  route('changelog', 'routes/changelog.tsx'),
  route('changelog/members/:handle', 'routes/member-changelog.tsx'),
  route('changelog/epics/:parentSlug/:slug', 'routes/project-changelog.tsx', {
    id: 'epic-project-changelog',
  }),
  route('changelog/epics/:slug', 'routes/project-changelog.tsx', { id: 'epic-changelog' }),
  route('changelog/projects/:slug', 'routes/project-changelog.tsx'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('llms.txt', 'routes/llms.ts'),
  route('kit', 'routes/kit.tsx'),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
