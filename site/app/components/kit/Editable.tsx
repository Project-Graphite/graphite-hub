import { useEffect, useRef, useState } from 'react';
import { useFetcher, useSearchParams } from 'react-router';
import { useRoot } from '../../hub';
import { defaults, SETTINGS, type SettingKey } from '../../settings';

type TextKey = {
  [K in SettingKey]: (typeof SETTINGS)[K]['kind'] extends 'text' ? K : never;
}[SettingKey];

export function useEditing() {
  const root = useRoot();
  const [params] = useSearchParams();
  return Boolean(root?.viewer?.owner && params.has('edit'));
}

export function Editable({
  setting,
  as: Tag = 'span',
  className,
}: {
  setting: TextKey;
  as?: 'span' | 'p';
  className?: string;
}) {
  const root = useRoot();
  const editing = useEditing();
  const fetcher = useFetcher<{ error?: string }>();
  const [saved, setSaved] = useState(false);
  const was = useRef(fetcher.state);
  useEffect(() => {
    const settled = was.current !== 'idle' && fetcher.state === 'idle';
    was.current = fetcher.state;
    if (!settled || fetcher.data?.error) {
      return;
    }
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 1400);
    return () => clearTimeout(timer);
  }, [fetcher.state, fetcher.data]);
  const value: string = (root?.settings ?? defaults())[setting];
  if (!editing) {
    return value ? <Tag className={className}>{value}</Tag> : null;
  }
  const { multiline, label } = SETTINGS[setting];
  return (
    <Tag
      key={value}
      className={className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={label}
      aria-multiline={multiline}
      data-editable=""
      data-placeholder={label}
      data-busy={fetcher.state !== 'idle' || undefined}
      data-saved={saved || undefined}
      data-error={fetcher.data?.error}
      title={fetcher.data?.error}
      onBlur={(event) => {
        const text = event.currentTarget.textContent ?? '';
        if (text !== value) {
          void fetcher.submit(
            { csrf: root?.csrf ?? '', intent: 'set', key: setting, value: JSON.stringify(text) },
            { method: 'post', action: '/admin' },
          );
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.textContent = value;
          event.currentTarget.blur();
        } else if (event.key === 'Enter' && !multiline) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}
