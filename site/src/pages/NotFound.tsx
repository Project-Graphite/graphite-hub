import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="pt-[88px] pb-5">
      <h1 className="page-title">Nothing here.</h1>
      <p className="mt-[22px] mb-6 max-w-[52ch] text-muted">
        That page does not exist. Deployed projects live on their own subdomains.
      </p>
      <Link to="/" className="rule-link mono-sm">
        back to the index
      </Link>
    </section>
  );
}
