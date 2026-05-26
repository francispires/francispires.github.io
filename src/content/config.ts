import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    lang: z.enum(['en', 'pt-BR']).default('en'),
    translationKey: z.string().optional(),
    category: z
      .enum(['data-engineering', 'python', 'sql', 'javascript', 'devops', 'math', 'misc'])
      .default('misc'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(true),
    authored: z.boolean().default(false),
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
  }),
});

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tech: z.array(z.string()),
    url: z.string().url().optional(),
    github: z.string().url().optional(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(99),
  }),
});

export const collections = { blog, projects };
