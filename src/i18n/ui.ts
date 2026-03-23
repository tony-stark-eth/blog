export const languages = {
  en: 'English',
  de: 'Deutsch',
} as const;

export type Locale = keyof typeof languages;

export const defaultLocale: Locale = 'en';

export const ui = {
  en: {
    'nav.home': 'Home',
    'nav.blog': 'Blog',
    'nav.personal': 'Personal',
    'blog.readMore': 'Read more',
    'blog.publishedOn': 'Published on',
    'blog.updatedOn': 'Updated on',
    'blog.minuteRead': 'min read',
    'blog.allPosts': 'All posts',
    'blog.taggedWith': 'Tagged with',
    'share.twitter': 'Share on Twitter',
    'share.linkedin': 'Share on LinkedIn',
    'share.copy': 'Copy link',
    'share.copied': 'Copied!',
    'toc.title': 'Table of Contents',
    'footer.builtWith': 'Built with',
  },
  de: {
    'nav.home': 'Start',
    'nav.blog': 'Blog',
    'nav.personal': 'Persönliches',
    'blog.readMore': 'Weiterlesen',
    'blog.publishedOn': 'Veröffentlicht am',
    'blog.updatedOn': 'Aktualisiert am',
    'blog.minuteRead': 'Min. Lesezeit',
    'blog.allPosts': 'Alle Beiträge',
    'blog.taggedWith': 'Getaggt mit',
    'share.twitter': 'Auf Twitter teilen',
    'share.linkedin': 'Auf LinkedIn teilen',
    'share.copy': 'Link kopieren',
    'share.copied': 'Kopiert!',
    'toc.title': 'Inhaltsverzeichnis',
    'footer.builtWith': 'Gebaut mit',
  },
} as const;

export function useTranslations(locale: Locale) {
  return function t(key: keyof (typeof ui)['en']): string {
    return ui[locale][key] ?? ui[defaultLocale][key];
  };
}

export function getLocaleFromPath(path: string): Locale {
  return path.startsWith('/de/') ? 'de' : 'en';
}
