import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()),
    draft: z.boolean().default(false),
    sticky: z.boolean().default(false),
    locale: z.enum(['en', 'de']),
    translationSlug: z.string().optional(),
    cover: z
      .object({
        src: z.string(),
        alt: z.string(),
      })
      .optional(),
    devtoId: z.number().optional(),
    hashnodeId: z.string().optional(),
  }),
});

export const collections = { blog };
