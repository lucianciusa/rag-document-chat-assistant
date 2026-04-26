import React, { createContext, useContext, useState, useCallback } from 'react';
import en from './en';
import es from './es';

type Lang = 'en' | 'es';
type Vars = Record<string, string | number>;

const DICTS: Record<Lang, Record<string, string>> = { en, es };
const STORAGE_KEY = 'lang';

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`
  );
}

function getDefaultLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'es') return stored;
  return navigator.language.startsWith('es') ? 'es' : 'en';
}

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Vars) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getDefaultLang);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars): string => {
      const dict = DICTS[lang];
      const template = dict[key] ?? DICTS['en'][key] ?? key;
      return interpolate(template, vars);
    },
    [lang]
  );

  return React.createElement(LangContext.Provider, { value: { lang, setLang, t } }, children);
}

export function useT() {
  return useContext(LangContext);
}
