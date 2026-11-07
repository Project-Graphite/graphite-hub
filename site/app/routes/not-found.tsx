import { data } from 'react-router';
import NotFound from '../components/NotFound';
import { topicsFor } from '../topics';

export const handle = topicsFor('not-found');

export function loader() {
  return data(null, { status: 404 });
}

export default function NotFoundRoute() {
  return <NotFound />;
}
