import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { CalendarDays, Clock, Eye, User } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { highlightCodeBlocks } from "@/lib/highlight";
import { extractToc } from "@/lib/toc";
import { Rule } from "@/components/site/rule";
import { ReadingProgress } from "@/components/site/reading-progress";
import { TransitionLink } from "@/components/site/transition-link";
import { CodeBlockEnhancer } from "@/components/site/code-block-enhancer";
import { TableOfContents } from "@/components/site/table-of-contents";
import { PostNeighbors } from "@/components/site/post-neighbors";
import { RelatedPosts } from "@/components/site/related-posts";
import { CommentsSection } from "./comments-section";

export const revalidate = 60;

const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api"
).replace(/\/api\/?$/, "");

function absoluteCover(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

export async function generateMetadata(
  props: PageProps<"/posts/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  try {
    const post = await api.getPostBySlug(slug);
    const description = post.summary ?? post.title;
    const ogImage = absoluteCover(post.coverUrl);
    return {
      title: post.title,
      description,
      openGraph: {
        type: "article",
        title: post.title,
        description,
        url: `/posts/${post.slug}`,
        publishedTime: post.publishedAt ?? post.createdAt,
        tags: post.tags ?? undefined,
        authors: post.author?.username ? [post.author.username] : undefined,
        images: ogImage ? [{ url: ogImage }] : undefined,
      },
      twitter: {
        card: ogImage ? "summary_large_image" : "summary",
        title: post.title,
        description,
        images: ogImage ? [ogImage] : undefined,
      },
    };
  } catch {
    return { title: "Not Found" };
  }
}

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function estimateReadingMinutes(html: string) {
  const cleaned = (html ?? "").replace(/<[^>]+>/g, " ").trim();
  return Math.max(1, Math.round(cleaned.length / 400));
}

export default async function PostPage(props: PageProps<"/posts/[slug]">) {
  const { slug } = await props.params;

  let post;
  try {
    post = await api.getPostBySlug(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const highlightedHtml = await highlightCodeBlocks(post.contentHtml);
  const toc = extractToc(post.contentHtml);
  const readingMin = estimateReadingMinutes(post.contentHtml);
  const dateStr = formatDateLong(post.publishedAt ?? post.createdAt);
  const authorName =
    post.author?.displayName || post.author?.username || "Kiri";

  return (
    <>
      <ReadingProgress />

      <article className="mx-auto w-full max-w-[68rem] px-6 pb-16 pt-8 md:px-10 md:pb-24 md:pt-14">
        <TransitionLink
          href="/"
          className="caps group inline-flex items-baseline gap-2 text-muted-foreground transition-colors hover:text-site-accent"
        >
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:-translate-x-0.5"
          >
            ←
          </span>
          Back to index
        </TransitionLink>

        {/* HEADER */}
        <header className="reveal mt-14 md:mt-20">
          <div className="caps mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 tabular">
              <CalendarDays className="size-3.5" strokeWidth={1.6} />
              {dateStr}
            </span>
            <span className="opacity-40" aria-hidden>
              ——
            </span>
            <span className="inline-flex items-center gap-1.5 tabular">
              <Clock className="size-3.5" strokeWidth={1.6} />
              {readingMin} min read
            </span>
            <span className="opacity-40" aria-hidden>
              ——
            </span>
            <span className="inline-flex items-center gap-1.5 tabular">
              <Eye className="size-3.5" strokeWidth={1.6} />
              {post.viewCount}
            </span>
            <span className="opacity-40" aria-hidden>
              ——
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" strokeWidth={1.6} />
              {authorName}
            </span>
          </div>

          <h1
            className="font-display text-[clamp(2.4rem,6.2vw,4.75rem)] font-medium leading-[1.05] tracking-[-0.028em] text-foreground"
            style={{ viewTransitionName: `post-title-${post.id}` }}
          >
            {post.title}
          </h1>

          {post.summary && (
            <p className="font-reading mt-7 max-w-[42rem] text-xl italic leading-[1.55] text-muted-foreground md:text-[1.5rem]">
              {post.summary}
            </p>
          )}
        </header>

        {post.coverUrl && (
          <figure className="reveal mx-auto mt-10 max-w-[56rem] md:mt-14">
            <div className="overflow-hidden rounded-md border border-site-rule/50 bg-site-paper-soft">
              <Image
                src={absoluteCover(post.coverUrl)!}
                alt={post.title}
                width={1600}
                height={900}
                priority
                unoptimized
                className="h-auto w-full object-cover max-h-[60vh]"
              />
            </div>
          </figure>
        )}

        {/* Separator */}
        <div className="my-12 md:my-16">
          <Rule variant="asterism" />
        </div>

        {/* BODY + TOC — two columns at xl+ */}
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_14rem] xl:items-start xl:gap-10">
          <div className="mx-auto w-full max-w-[42rem]">
            <div
              id="article-body"
              className="prose-editorial"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
            <CodeBlockEnhancer scope="#article-body" />
          </div>

          <TableOfContents headings={toc} />
        </div>

        {/* SIGN-OFF */}
        <div className="mx-auto mt-16 max-w-[42rem] md:mt-24">
          <Rule variant="tilde" />

          <div className="mt-10 grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
            <div className="font-display text-lg italic leading-snug text-foreground">
              —&nbsp;{authorName}
              <span className="caps mt-2 block not-italic text-xs text-muted-foreground">
                {dateStr}
              </span>
            </div>

            {post.tags && post.tags.length > 0 && (
              <div className="caps flex flex-wrap items-baseline gap-x-2 gap-y-1 text-muted-foreground md:justify-end">
                <span className="mr-1">Filed under</span>
                {post.tags.map((t, i) => (
                  <span key={t} className="inline-flex items-baseline">
                    <TransitionLink
                      href={`/tags/${encodeURIComponent(t)}`}
                      className="text-foreground transition-colors hover:text-site-accent"
                    >
                      {t}
                    </TransitionLink>
                    {i < post.tags!.length - 1 && (
                      <span className="mx-1.5 opacity-40" aria-hidden>
                        ·
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PREV / NEXT */}
        <div className="mt-20 md:mt-28">
          <Suspense fallback={null}>
            <PostNeighbors slug={slug} />
          </Suspense>
        </div>

        {/* RELATED */}
        <div className="mt-20 md:mt-28">
          <Suspense fallback={null}>
            <RelatedPosts slug={slug} />
          </Suspense>
        </div>

        {/* COMMENTS */}
        <div className="mx-auto mt-20 max-w-[42rem] md:mt-28">
          <Rule variant="line" />
          <CommentsSection slug={slug} />
        </div>
      </article>
    </>
  );
}
