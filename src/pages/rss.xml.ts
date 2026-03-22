import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const allPosts = await getCollection('blog', ({ data }) => {
    return data.locale === 'en' && !data.draft;
  });

  const posts = allPosts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: 'Building in Public',
    description: 'A developer blog about building things in public, sharing learnings and shipping software.',
    site: context.site ?? 'https://blog.tony-stark.xyz',
    items: posts.map((post) => {
      const slug = post.id.replace(/^en\//, '').replace(/\.mdx?$/, '');
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link: `/blog/${slug}/`,
      };
    }),
    customData: `<language>en-US</language>`,
  });
}
