import type { BlogCorpus } from '../types/blog';

let cached: BlogCorpus | null = null;

export async function loadBlogCorpus(): Promise<BlogCorpus> {
  if (cached) return cached;
  const res = await fetch('/blog/blog.json');
  if (!res.ok) throw new Error('Blog corpus not found. Run: npm run blog');
  cached = await res.json();
  return cached!;
}
