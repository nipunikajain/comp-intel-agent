import type { NewsItem } from "@/lib/types";

export interface NewsSectionProps {
  news: NewsItem[];
  title?: string;
}

export function NewsSection({ news, title = "Recent news" }: NewsSectionProps) {
  if (!news.length) return <p className="text-sm text-gray-500">No recent news</p>;

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-900">{title}</h4>
      <ul className="space-y-2">
        {news.map((n, i) => (
          <li key={i} className="rounded-lg border border-gray-200 bg-gray-50/50 p-2 text-sm">
            <a
              href={n.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 underline hover:text-blue-700"
            >
              {n.title}
            </a>
            {n.summary && <p className="mt-0.5 text-gray-600">{n.summary}</p>}
            {n.date && <p className="text-xs text-gray-500">{n.date}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
