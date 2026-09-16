import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const saved = localStorage.getItem('graphite-theme');
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('graphite-theme');
      return;
    }

    document.documentElement.dataset.theme = theme;
    localStorage.setItem('graphite-theme', theme);
  }, [theme]);

  function cycleTheme() {
    setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  }

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="mono-sm border-0 bg-transparent p-0 text-muted hover:text-ink"
      aria-label={`Theme is ${theme}. Change theme.`}
    >
      {theme}
    </button>
  );
}
