import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const allPosts = await getCollection('blog', ({ data }) => {
    return data.locale === 'de' && !data.draft;
  });

  const posts = allPosts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: 'Building in Public',
    description: 'Ein Entwickler-Blog über das öffentliche Bauen und Teilen von Erfahrungen in der Softwareentwicklung.',
    site: context.site ?? 'https://blog.tony-stark.xyz',
    items: posts.map((post) => {
      const slug = post.id.replace(/^de\//, '').replace(/\.mdx?$/, '');
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link: `/de/blog/${slug}/`,
      };
    }),
    customData: `<language>de-DE</language>`,
  });
}
