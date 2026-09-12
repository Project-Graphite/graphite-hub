import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="pt-[88px] pb-24">
      <h1 className="m-0 text-[clamp(1.6rem,4vw,2.2rem)] font-[640] tracking-[-0.03em]">
        Nothing here.
      </h1>
      <p className="mt-3.5 mb-6 max-w-[46ch] text-muted">
        That page does not exist. Deployed projects live on their own subdomains.
      </p>
      <Link
        to="/"
        className="border-b border-line pb-px font-mono text-[0.82em] text-ink no-underline hover:border-ink"
      >
        back to the index ↗
      </Link>
    </section>
  );
}
