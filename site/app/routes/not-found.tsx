import { data } from 'react-router';
import NotFound from '../components/NotFound';

export function loader() {
  return data(null, { status: 404 });
}

export default function NotFoundRoute() {
  return <NotFound />;
}
