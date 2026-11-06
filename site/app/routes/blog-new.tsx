import { data, Form, redirect } from 'react-router';
import type { Route } from './+types/blog-new';
import { Button } from '../components/kit/basics';
import { PageHeader } from '../components/kit/page';
import { Page } from '../components/Shell';
import { hubContext } from '../context';
import { useRoot } from '../hub';
import { checkedForm, EDITOR_PATH, member } from '../pages/blog';
import { isRefused } from '../profile';

export const handle = { topics: ['posts'] };

export function loader({ context }: Route.LoaderArgs) {
  const hub = context.get(hubContext);
  const { handle } = member(hub);
  return { templates: hub.posts.templates(handle) };
}

export async function action({ context, request }: Route.ActionArgs) {
  const hub = context.get(hubContext);
  const { handle } = member(hub);
  const form = await checkedForm(hub, request);
  try {
    if (form.get('intent') === 'remove-template') {
      hub.posts.removeTemplate(String(form.get('template') ?? ''), handle);
      return { ok: true };
    }
    const template = String(form.get('template') ?? 'blank');
    const id = await hub.posts.create(handle, handle, template);
    throw redirect(EDITOR_PATH(id));
  } catch (error) {
    if (isRefused(error)) {
      return data({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

const TEMPLATE_LINES: Record<string, string[]> = {
  blank: ['', '', ''],
  announcement: ['what it is', 'why we built it', 'try it'],
  'release-notes': ['highlights', 'changes', 'upgrading'],
  tutorial: ['before you start', 'step 1', 'step 2', 'where to go next'],
};

export default function BlogNew({ loaderData }: Route.ComponentProps) {
  const csrf = useRoot()!.csrf ?? '';
  return (
    <Page>
      <div className="blog">
        <PageHeader
          path="/blog/new"
          title="Start a post"
          actions={<Button to="/blog/mine">your posts</Button>}
        />
        <section className="band">
          <div className="templates">
            {loaderData.templates.map((template, index) => (
              <Form
                key={template.id}
                method="post"
                className="template"
                style={{ '--i': index } as never}
              >
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="template" value={template.id} />
                <button type="submit" name="intent" value="create" className="sheet">
                  <span className="lines" aria-hidden="true">
                    <i className="title" />
                    {(TEMPLATE_LINES[template.id] ?? ['', '', '']).map((line, at) => (
                      <i key={at} className={line ? 'heading' : ''} data-text={line} />
                    ))}
                  </span>
                  <strong>{template.name}</strong>
                </button>
                {template.by && (
                  <button
                    type="submit"
                    name="intent"
                    value="remove-template"
                    className="remove"
                    aria-label={`Remove ${template.name}`}
                  >
                    ×
                  </button>
                )}
              </Form>
            ))}
          </div>
        </section>
      </div>
    </Page>
  );
}
