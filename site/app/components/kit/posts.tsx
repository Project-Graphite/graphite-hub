import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { day } from '../../format';
import { useHub } from '../../hub';
import { useMotion, useSpotlight, useTilt } from '../../motion/motion';
import type { PostSummary } from '../../posts';
import TagList from '../TagList';
import { accentStyle, Avatar, Cover } from './basics';
import { Views } from './live';

export function PostCard({ post, compact = false }: { post: PostSummary; compact?: boolean }) {
  const hub = useHub();
  const author = hub.memberByHandle(post.author);
  const project = post.project ? hub.projectBySlug(post.project) : undefined;
  const tilt = useTilt<HTMLElement>();
  const spot = useSpotlight<HTMLElement>();
  const pointer = useCallback(
    (element: HTMLElement | null) => {
      tilt(element);
      spot(element);
    },
    [tilt, spot],
  );
  return (
    <article
      ref={pointer}
      className={`post-card spot tilt ${compact ? 'compact' : ''}`}
      style={accentStyle(author?.accent)}
    >
      <Link to={post.path} className="face" tabIndex={-1} aria-hidden="true">
        <Cover
          name={post.title}
          seed={post.id}
          accent={author?.accent ?? ''}
          image={post.coverUrl}
        />
      </Link>
      <div className="body">
        <p className="meta">
          <time dateTime={post.publishedAt}>{day(post.publishedAt)}</time>
          <span>{post.readingMinutes} min read</span>
          <Views kind="post" id={post.id} />
          {project && (
            <Link to={project.path} className="about">
              {project.name}
            </Link>
          )}
        </p>
        <h3>
          <Link to={post.path}>{post.title}</Link>
        </h3>
        {!compact && post.summary && <p className="summary">{post.summary}</p>}
        <div className="foot">
          {author && (
            <Link to={`${author.path}/blog`} className="by">
              <Avatar member={author} size="xs" />
              {author.name}
            </Link>
          )}
          {!compact && <TagList tags={post.tags.slice(0, 3)} />}
        </div>
      </div>
    </article>
  );
}

export function Filmstrip({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: true });
  const smooth = useMotion('tilt');

  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const room = element.scrollWidth - element.clientWidth;
    setProgress(room > 0 ? element.scrollLeft / room : 1);
    setEdges({ start: element.scrollLeft < 4, end: room - element.scrollLeft < 4 });
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (
        Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
        element.scrollWidth > element.clientWidth
      ) {
        const room = element.scrollWidth - element.clientWidth;
        const at = element.scrollLeft;
        if ((event.deltaY > 0 && at < room - 1) || (event.deltaY < 0 && at > 1)) {
          event.preventDefault();
          element.scrollLeft += event.deltaY;
        }
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
    };
  }, [measure]);

  const step = (direction: 1 | -1) => {
    const element = scroller.current;
    element?.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  return (
    <div
      className="filmstrip"
      data-start={edges.start || undefined}
      data-end={edges.end || undefined}
    >
      <div ref={scroller} className="reel" onScroll={measure} aria-label={label}>
        {children}
      </div>
      <button
        type="button"
        className="chevron prev"
        aria-label="Scroll back"
        onClick={() => step(-1)}
      >
        ←
      </button>
      <button
        type="button"
        className="chevron next"
        aria-label="Scroll forward"
        onClick={() => step(1)}
      >
        →
      </button>
      <div className="progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress.toFixed(3)})` }} />
      </div>
    </div>
  );
}

export function WritingStrip({ posts, label = 'posts' }: { posts: PostSummary[]; label?: string }) {
  return (
    <Filmstrip label={label}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </Filmstrip>
  );
}

export function PostRow({ post }: { post: PostSummary }) {
  const hub = useHub();
  const author = hub.memberByHandle(post.author);
  return (
    <Link to={post.path} className="post-row" style={accentStyle(author?.accent)}>
      <span className="title">{post.title}</span>
      <span className="meta">
        <time dateTime={post.publishedAt}>{day(post.publishedAt)}</time>
        <span>{post.readingMinutes} min</span>
      </span>
    </Link>
  );
}
