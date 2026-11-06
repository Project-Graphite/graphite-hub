import type { Values } from '../app/settings.ts';
import { escapeXml as escape } from './feeds.ts';

export interface EmailLinks {
  manage: string;
  unsubscribe: string;
}

export interface EmailPost {
  title: string;
  summary: string;
  excerpt: string;
  url: string;
  coverUrl: string | null;
  author: { name: string; url: string; accent: string };
  project: { name: string; url: string } | null;
  publishedAt: string;
  readingMinutes: number;
}

export type EmailInput =
  | { kind: 'confirm'; what: string; confirmUrl: string }
  | { kind: 'manage'; what: string; links: EmailLinks }
  | { kind: 'post'; what: string; post: EmailPost; links: EmailLinks }
  | { kind: 'digest'; what: string; posts: EmailPost[]; since: string; links: EmailLinks };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailSite {
  name: string;
  url: string;
}

const PALETTE = {
  paper: '#0c0c0e',
  surface: '#131316',
  line: '#26262c',
  ink: '#e8e8ea',
  muted: '#8b8b95',
  faint: '#7d7d87',
  live: '#46b97a',
};
const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export function excerptOf(html: string, words = 70) {
  const paragraphs = [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((match) => match[1]);
  const text = (paragraphs.length > 0 ? paragraphs.join(' ') : html)
    .replace(/<(pre|script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const parts = text.split(' ');
  return parts.length > words ? `${parts.slice(0, words).join(' ')}…` : text;
}

function day(iso: string) {
  const date = new Date(iso);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function button(label: string, url: string, accent = PALETTE.ink) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr><td bgcolor="${accent}" style="border-radius:8px;background:${accent}"><a href="${escape(url)}" style="display:inline-block;padding:12px 22px;font-family:${MONO};font-size:14px;font-weight:600;color:${PALETTE.paper};text-decoration:none;border-radius:8px">${escape(label)} &rarr;</a></td></tr></table>`;
}

function paragraph(text: string, color = PALETTE.muted) {
  return `<p style="margin:0 0 14px;font-family:${SANS};font-size:16px;line-height:1.6;color:${color}">${escape(text)}</p>`;
}

function meta(parts: string[]) {
  return `<p style="margin:0 0 10px;font-family:${MONO};font-size:12px;color:${PALETTE.faint}">${parts.map(escape).join(' &middot; ')}</p>`;
}

function postCard(post: EmailPost, full: boolean) {
  const cover = post.coverUrl
    ? `<a href="${escape(post.url)}" style="display:block;margin:0 0 16px"><img src="${escape(post.coverUrl)}" width="552" alt="" style="display:block;width:100%;max-width:552px;height:auto;border-radius:8px;border:1px solid ${PALETTE.line}"></a>`
    : '';
  const about = post.project
    ? [
        `about <a href="${escape(post.project.url)}" style="color:${post.author.accent};text-decoration:none">${escape(post.project.name)}</a>`,
      ]
    : [];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${full ? 0 : 16}px"><tr><td style="padding:${full ? 0 : 18}px ${full ? 0 : 20}px;${full ? '' : `border:1px solid ${PALETTE.line};border-left:3px solid ${post.author.accent};border-radius:10px;background:${PALETTE.surface}`}">
${full ? cover : ''}
${meta([day(post.publishedAt), `${post.readingMinutes} min read`])}
<h2 style="margin:0 0 8px;font-family:${SANS};font-size:${full ? 26 : 19}px;font-weight:650;line-height:1.2;letter-spacing:-0.02em;color:${PALETTE.ink}"><a href="${escape(post.url)}" style="color:${PALETTE.ink};text-decoration:none">${escape(post.title)}</a></h2>
<p style="margin:0 0 ${full ? 14 : 6}px;font-family:${MONO};font-size:12px;color:${PALETTE.faint}">by <a href="${escape(post.author.url)}" style="color:${post.author.accent};text-decoration:none">${escape(post.author.name)}</a>${about.length ? ` ${about[0]}` : ''}</p>
${post.summary ? paragraph(post.summary, full ? PALETTE.ink : PALETTE.muted) : ''}
${full && post.excerpt ? paragraph(post.excerpt) : ''}
${full ? button('Read the post', post.url, post.author.accent) : `<a href="${escape(post.url)}" style="font-family:${MONO};font-size:13px;color:${PALETTE.ink};text-decoration:none;border-bottom:1px solid ${PALETTE.line}">read it &rarr;</a>`}
</td></tr></table>`;
}

function postText(post: EmailPost, full: boolean) {
  return [
    post.title,
    `by ${post.author.name}${post.project ? ` about ${post.project.name}` : ''} · ${day(post.publishedAt)} · ${post.readingMinutes} min read`,
    post.summary,
    full ? post.excerpt : '',
    post.url,
  ]
    .filter(Boolean)
    .join('\n');
}

function shell(site: EmailSite, title: string, body: string, footer: string, accent: string) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escape(title)}</title>
</head>
<body bgcolor="${PALETTE.paper}" style="margin:0;padding:0;background:${PALETTE.paper};color:${PALETTE.ink}">
<div style="display:none;max-height:0;overflow:hidden;color:${PALETTE.paper}">${escape(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.paper}" style="background:${PALETTE.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 0 20px;font-family:${SANS};font-size:16px;font-weight:620;letter-spacing:-0.02em;color:${PALETTE.ink}"><a href="${escape(site.url)}" style="color:${PALETTE.ink};text-decoration:none"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${accent};vertical-align:middle;margin-right:10px"></span>${escape(site.name)}</a></td></tr>
<tr><td style="height:1px;background:${PALETTE.line};line-height:1px;font-size:1px">&nbsp;</td></tr>
<tr><td style="padding:28px 0 8px">
${body}
</td></tr>
<tr><td style="height:1px;background:${PALETTE.line};line-height:1px;font-size:1px">&nbsp;</td></tr>
<tr><td style="padding:18px 0 0;font-family:${MONO};font-size:12px;line-height:1.7;color:${PALETTE.faint}">
${footer}
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function footerLinks(links: EmailLinks) {
  return `<a href="${escape(links.manage)}" style="color:${PALETTE.muted};text-decoration:underline">preferences</a> &middot; <a href="${escape(links.unsubscribe)}" style="color:${PALETTE.muted};text-decoration:underline">unsubscribe</a>`;
}

export function renderEmail(input: EmailInput, settings: Values, site: EmailSite): RenderedEmail {
  const common = { site: site.name, what: input.what };
  const footerLine = fill(settings['email.footer'], common);
  switch (input.kind) {
    case 'confirm': {
      const subject = fill(settings['email.confirm.subject'], common);
      const intro = fill(settings['email.confirm.body'], common);
      return {
        subject,
        html: shell(
          site,
          subject,
          `<h1 style="margin:0 0 16px;font-family:${SANS};font-size:26px;font-weight:650;letter-spacing:-0.03em;line-height:1.15;color:${PALETTE.ink}">${escape(subject)}</h1>${paragraph(intro)}${button('Confirm', input.confirmUrl, PALETTE.live)}`,
          `${escape(site.name)} &middot; <a href="${escape(site.url)}" style="color:${PALETTE.muted}">${escape(site.url.replace(/^https?:\/\//, ''))}</a>`,
          PALETTE.live,
        ),
        text: [subject, '', intro, '', `Confirm: ${input.confirmUrl}`, '', site.url].join('\n'),
      };
    }
    case 'manage': {
      const subject = `Your subscription to ${site.name}`;
      const intro = `This address already gets ${input.what}. Change what you get, or stop, from the links below.`;
      return {
        subject,
        html: shell(
          site,
          subject,
          `<h1 style="margin:0 0 16px;font-family:${SANS};font-size:26px;font-weight:650;letter-spacing:-0.03em;line-height:1.15;color:${PALETTE.ink}">${escape(subject)}</h1>${paragraph(intro)}${button('Your preferences', input.links.manage)}`,
          `${escape(footerLine)}<br>${footerLinks(input.links)}`,
          PALETTE.ink,
        ),
        text: [
          subject,
          '',
          intro,
          '',
          `Preferences: ${input.links.manage}`,
          `Unsubscribe: ${input.links.unsubscribe}`,
          '',
          footerLine,
        ].join('\n'),
      };
    }
    case 'post': {
      const values = {
        ...common,
        title: input.post.title,
        author: input.post.author.name,
        about: input.post.project ? ` about ${input.post.project.name}` : '',
      };
      const subject = fill(settings['email.post.subject'], values);
      const intro = fill(settings['email.post.body'], values);
      return {
        subject,
        html: shell(
          site,
          subject,
          `${paragraph(intro)}${postCard(input.post, true)}`,
          `${escape(footerLine)}<br>${footerLinks(input.links)}`,
          input.post.author.accent,
        ),
        text: [
          intro,
          '',
          postText(input.post, true),
          '',
          footerLine,
          `Preferences: ${input.links.manage}`,
          `Unsubscribe: ${input.links.unsubscribe}`,
        ].join('\n'),
      };
    }
    case 'digest': {
      const values = {
        ...common,
        count: String(input.posts.length),
        posts: input.posts.length === 1 ? 'post' : 'posts',
      };
      const subject = fill(settings['email.digest.subject'], values);
      const intro = fill(settings['email.digest.body'], values);
      return {
        subject,
        html: shell(
          site,
          subject,
          `${meta([`since ${day(input.since)}`, `${input.posts.length} ${values.posts}`])}<h1 style="margin:0 0 12px;font-family:${SANS};font-size:26px;font-weight:650;letter-spacing:-0.03em;line-height:1.15;color:${PALETTE.ink}">${escape(subject)}</h1>${paragraph(intro)}<div style="height:10px"></div>${input.posts.map((post) => postCard(post, false)).join('')}`,
          `${escape(footerLine)}<br>${footerLinks(input.links)}`,
          input.posts[0]?.author.accent ?? PALETTE.ink,
        ),
        text: [
          subject,
          '',
          intro,
          '',
          ...input.posts.flatMap((post) => [postText(post, false), '']),
          footerLine,
          `Preferences: ${input.links.manage}`,
          `Unsubscribe: ${input.links.unsubscribe}`,
        ].join('\n'),
      };
    }
  }
}
