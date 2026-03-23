import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostFrontmatter {
  title: string;
  description: string;
  date: string;
  tags: string[];
  locale: string;
  draft?: boolean;
  category?: string;
  translationSlug?: string;
  cover?: {
    src: string;
    alt: string;
  };
}

interface Post {
  slug: string;
  frontmatter: PostFrontmatter;
  body: string;
}

interface DevtoState {
  id: number;
  publishedAt: string;
}

interface HashnodeState {
  id: string;
  publishedAt: string;
}

interface PostState {
  devto?: DevtoState;
  hashnode?: HashnodeState;
}

interface CrossPostState {
  [slug: string]: PostState;
}

interface DevtoArticlePayload {
  article: {
    title: string;
    body_markdown: string;
    published: boolean;
    tags: string[];
    canonical_url: string;
    description: string;
  };
}

interface DevtoApiResponse {
  id: number;
  url: string;
  errors?: string[];
  error?: string;
  status?: string;
}

interface HashnodePublishVariables {
  input: {
    title: string;
    contentMarkdown: string;
    publicationId: string;
    tags: Array<{ name: string; slug: string }>;
    originalArticleURL: string;
    subtitle: string;
  };
}

interface HashnodeUpdateVariables {
  input: {
    id: string;
    title: string;
    contentMarkdown: string;
    tags: Array<{ name: string; slug: string }>;
    originalArticleURL: string;
    subtitle: string;
  };
}

interface HashnodeApiResponse {
  data?: {
    publishPost?: {
      post: { id: string; url: string };
    };
    updatePost?: {
      post: { id: string; url: string };
    };
  };
  errors?: Array<{ message: string }>;
}

// ---------------------------------------------------------------------------
// Config & env
// ---------------------------------------------------------------------------

const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const DEVTO_API_KEY = process.env.DEVTO_API_KEY ?? "";
const HASHNODE_PAT = process.env.HASHNODE_PAT ?? "";
const HASHNODE_PUBLICATION_ID = process.env.HASHNODE_PUBLICATION_ID ?? "";

const STATE_FILE = ".cross-post-state.json";
const CONTENT_DIR = "src/content/blog/en";

function requireEnv(name: string, value: string): void {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Frontmatter parser (no external deps)
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { frontmatter: PostFrontmatter; body: string } {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error("No frontmatter block found");
  }

  const yamlBlock = fmMatch[1];
  const body = fmMatch[2].trim();

  // Parse simple YAML — handles strings, booleans, arrays, and nested objects
  function parseYamlValue(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed === "null" || trimmed === "~") return null;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    // Quoted strings
    if (/^["'](.*)["']$/.test(trimmed)) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  function parseInlineArray(value: string): unknown[] {
    const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!inner.trim()) return [];
    return inner.split(",").map((item) => {
      const v = item.trim();
      if (/^["'](.*)["']$/.test(v)) return v.slice(1, -1);
      return v;
    });
  }

  const result: Record<string, unknown> = {};
  const lines = yamlBlock.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1 || line.startsWith(" ") || line.startsWith("-")) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (rest.startsWith("[")) {
      result[key] = parseInlineArray(rest);
    } else if (rest === "") {
      // Could be block scalar or nested object — collect indented lines
      const children: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].startsWith("\t"))) {
        children.push(lines[i]);
        i++;
      }
      // Check if it's a sequence
      if (children.length > 0 && children[0].trim().startsWith("-")) {
        result[key] = children.map((c) => {
          const v = c.trim().replace(/^-\s*/, "");
          if (/^["'](.*)["']$/.test(v)) return v.slice(1, -1);
          return v;
        });
      } else {
        // Nested object (e.g. cover:)
        const nested: Record<string, unknown> = {};
        for (const child of children) {
          const ci = child.indexOf(":");
          if (ci !== -1) {
            const ck = child.slice(0, ci).trim();
            const cv = child.slice(ci + 1).trim();
            nested[ck] = parseYamlValue(cv);
          }
        }
        result[key] = nested;
      }
      continue;
    } else {
      result[key] = parseYamlValue(rest);
    }

    i++;
  }

  return {
    frontmatter: result as unknown as PostFrontmatter,
    body,
  };
}

// ---------------------------------------------------------------------------
// Load posts from filesystem
// ---------------------------------------------------------------------------

function loadPosts(): Post[] {
  if (!existsSync(CONTENT_DIR)) {
    console.warn(`Content directory not found: ${CONTENT_DIR}`);
    return [];
  }

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));

  const posts: Post[] = [];

  for (const file of files) {
    const slug = basename(file, file.endsWith(".mdx") ? ".mdx" : ".md");
    const filePath = join(CONTENT_DIR, file);

    try {
      const raw = readFileSync(filePath, "utf-8");
      const { frontmatter, body } = parseFrontmatter(raw);

      if (frontmatter.draft) {
        continue;
      }

      if (frontmatter.category === "personal") {
        continue;
      }

      posts.push({ slug, frontmatter, body });
    } catch (err) {
      console.error(`Failed to parse ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  return posts;
}

// ---------------------------------------------------------------------------
// Markdown sanitization
// ---------------------------------------------------------------------------

function sanitizeMarkdown(body: string, slug: string, siteUrl: string): string {
  let md = body;

  // Remove import statements (MDX)
  md = md.replace(/^import\s+.+$/gm, "");

  // Remove MDX/JSX expressions like {variable} and <Component />
  md = md.replace(/<[A-Z][A-Za-z]*\s*\/>/g, `*[See original post](${siteUrl}/blog/${slug}/)*`);
  md = md.replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, `*[See original post](${siteUrl}/blog/${slug}/)*`);

  // Convert relative image paths to absolute URLs
  // Matches: ![alt](/images/...) or ![alt](../images/...) etc.
  md = md.replace(/!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g, (_, alt: string, src: string) => {
    const cleanSrc = src.startsWith("/") ? src : `/${src.replace(/^\.\.?\/?/, "")}`;
    return `![${alt}](${siteUrl}${cleanSrc})`;
  });

  // Remove blank lines left by removed imports
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return md;
}

function buildCrossPostMarkdown(body: string, slug: string, canonicalUrl: string, siteUrl: string): string {
  const sanitized = sanitizeMarkdown(body, slug, siteUrl);

  const banner = `> *Originally published on [my blog](${canonicalUrl})*\n\n`;
  const footer = `\n\n---\n*Found this useful? Follow me on [my blog](${siteUrl}) for more.*`;

  return `${banner}${sanitized}${footer}`;
}

// ---------------------------------------------------------------------------
// Dev.to API
// ---------------------------------------------------------------------------

async function publishToDevto(post: Post, canonicalUrl: string, markdown: string): Promise<number> {
  const payload: DevtoArticlePayload = {
    article: {
      title: post.frontmatter.title,
      body_markdown: markdown,
      published: true,
      tags: (post.frontmatter.tags ?? []).slice(0, 4).map((t) => t.replace(/-/g, "")),
      canonical_url: canonicalUrl,
      description: post.frontmatter.description ?? "",
    },
  };

  const response = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "api-key": DEVTO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dev.to POST failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as DevtoApiResponse;

  if (data.error || (data.errors && data.errors.length > 0)) {
    throw new Error(`Dev.to API error: ${data.error ?? data.errors?.join(", ")}`);
  }

  return data.id;
}

async function updateOnDevto(articleId: number, post: Post, canonicalUrl: string, markdown: string): Promise<void> {
  const payload: DevtoArticlePayload = {
    article: {
      title: post.frontmatter.title,
      body_markdown: markdown,
      published: true,
      tags: (post.frontmatter.tags ?? []).slice(0, 4).map((t) => t.replace(/-/g, "")),
      canonical_url: canonicalUrl,
      description: post.frontmatter.description ?? "",
    },
  };

  const response = await fetch(`https://dev.to/api/articles/${articleId}`, {
    method: "PUT",
    headers: {
      "api-key": DEVTO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dev.to PUT failed (${response.status}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Hashnode GraphQL API
// ---------------------------------------------------------------------------

async function publishToHashnode(post: Post, canonicalUrl: string, markdown: string): Promise<string> {
  const mutation = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post {
          id
          url
        }
      }
    }
  `;

  const variables: HashnodePublishVariables = {
    input: {
      title: post.frontmatter.title,
      contentMarkdown: markdown,
      publicationId: HASHNODE_PUBLICATION_ID,
      tags: (post.frontmatter.tags ?? []).map((t) => ({
        name: t,
        slug: t.toLowerCase().replace(/\s+/g, "-"),
      })),
      originalArticleURL: canonicalUrl,
      subtitle: post.frontmatter.description ?? "",
    },
  };

  const response = await fetch("https://gql.hashnode.com", {
    method: "POST",
    headers: {
      Authorization: HASHNODE_PAT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hashnode publishPost failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as HashnodeApiResponse;

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Hashnode GraphQL error: ${data.errors.map((e) => e.message).join(", ")}`);
  }

  const postId = data.data?.publishPost?.post?.id;
  if (!postId) {
    throw new Error("Hashnode publishPost returned no post ID");
  }

  return postId;
}

async function updateOnHashnode(postId: string, post: Post, canonicalUrl: string, markdown: string): Promise<void> {
  const mutation = `
    mutation UpdatePost($input: UpdatePostInput!) {
      updatePost(input: $input) {
        post {
          id
          url
        }
      }
    }
  `;

  const variables: HashnodeUpdateVariables = {
    input: {
      id: postId,
      title: post.frontmatter.title,
      contentMarkdown: markdown,
      tags: (post.frontmatter.tags ?? []).map((t) => ({
        name: t,
        slug: t.toLowerCase().replace(/\s+/g, "-"),
      })),
      originalArticleURL: canonicalUrl,
      subtitle: post.frontmatter.description ?? "",
    },
  };

  const response = await fetch("https://gql.hashnode.com", {
    method: "POST",
    headers: {
      Authorization: HASHNODE_PAT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hashnode updatePost failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as HashnodeApiResponse;

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Hashnode GraphQL error: ${data.errors.map((e) => e.message).join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function loadState(): CrossPostState {
  if (!existsSync(STATE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as CrossPostState;
  } catch {
    console.warn(`Could not parse ${STATE_FILE}, starting with empty state`);
    return {};
  }
}

function saveState(state: CrossPostState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  requireEnv("SITE_URL", SITE_URL);
  requireEnv("DEVTO_API_KEY", DEVTO_API_KEY);
  requireEnv("HASHNODE_PAT", HASHNODE_PAT);
  requireEnv("HASHNODE_PUBLICATION_ID", HASHNODE_PUBLICATION_ID);

  const targetSlug = process.argv[2] ?? null;

  const state = loadState();
  const posts = loadPosts();

  if (posts.length === 0) {
    console.log("No published posts found.");
    return;
  }

  const postsToProcess = targetSlug ? posts.filter((p) => p.slug === targetSlug) : posts;

  if (targetSlug && postsToProcess.length === 0) {
    console.error(`No post found with slug: ${targetSlug}`);
    process.exit(1);
  }

  console.log(`Processing ${postsToProcess.length} post(s)...`);

  let hasErrors = false;

  for (const post of postsToProcess) {
    const canonicalUrl = `${SITE_URL}/blog/${post.slug}/`;
    const markdown = buildCrossPostMarkdown(post.body, post.slug, canonicalUrl, SITE_URL);
    const existing = state[post.slug] ?? {};

    console.log(`\n[${post.slug}]`);

    // --- Dev.to ---
    try {
      if (!existing.devto) {
        console.log("  Dev.to: publishing...");
        const id = await publishToDevto(post, canonicalUrl, markdown);
        state[post.slug] = {
          ...state[post.slug],
          devto: { id, publishedAt: new Date().toISOString() },
        };
        console.log(`  Dev.to: published (id=${id})`);
      } else {
        console.log(`  Dev.to: updating (id=${existing.devto.id})...`);
        await updateOnDevto(existing.devto.id, post, canonicalUrl, markdown);
        console.log("  Dev.to: updated");
      }
    } catch (err) {
      hasErrors = true;
      console.error(`  Dev.to ERROR:`, err instanceof Error ? err.message : err);
    }

    // --- Hashnode ---
    try {
      if (!existing.hashnode) {
        console.log("  Hashnode: publishing...");
        const id = await publishToHashnode(post, canonicalUrl, markdown);
        state[post.slug] = {
          ...state[post.slug],
          hashnode: { id, publishedAt: new Date().toISOString() },
        };
        console.log(`  Hashnode: published (id=${id})`);
      } else {
        console.log(`  Hashnode: updating (id=${existing.hashnode.id})...`);
        await updateOnHashnode(existing.hashnode.id, post, canonicalUrl, markdown);
        console.log("  Hashnode: updated");
      }
    } catch (err) {
      hasErrors = true;
      console.error(`  Hashnode ERROR:`, err instanceof Error ? err.message : err);
    }

    // Save state after each post so partial progress is not lost on failure
    saveState(state);

    // Delay between posts to avoid Dev.to rate limiting (30s cooldown)
    if (postsToProcess.indexOf(post) < postsToProcess.length - 1) {
      console.log("  Waiting 35s for rate limit...");
      await new Promise((resolve) => setTimeout(resolve, 35000));
    }
  }

  console.log("\nDone. State saved to", STATE_FILE);

  // Medium reminder (no API — must import manually)
  const newPosts = postsToProcess.filter((p) => !state[p.slug]?.devto || !state[p.slug]?.hashnode);
  if (newPosts.length === 0 && postsToProcess.length > 0) {
    console.log("\nMedium reminder: Import new posts manually at https://medium.com/me/stories → Import a story → paste the canonical URL. Medium auto-sets the canonical.");
  }

  if (hasErrors) {
    process.exit(1);
  }
}

await main();
