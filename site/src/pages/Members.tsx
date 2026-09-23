import MemberCard from '../components/MemberCard';
import Section from '../components/Section';
import { members } from '../registry';

export default function Members() {
  return (
    <>
      <section className="pt-22 pb-5">
        <p className="mono-sm m-0 mb-3 text-faint">/members</p>
        <h1 className="page-title max-w-[20ch]">Members</h1>
        <p className="mt-5.5 mb-0 max-w-[52ch] text-muted">
          The people building and maintaining every project in the registry.
        </p>
      </section>

      <Section label="all members">
        {members.length === 0 ? (
          <p className="mono-sm m-0 text-faint">No members registered yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {members.map((member) => (
              <MemberCard key={member.handle} member={member} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
