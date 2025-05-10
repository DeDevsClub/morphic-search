'use client'

import { SearchResults } from '@/components/search-results'
import { Section } from '@/components/section'
import type {
  SearchResultItem,
  SearchResults as TypeSearchResults
} from '@/lib/types/index'
import type { ToolInvocation } from 'ai'
import remarkGfm from 'remark-gfm'
import { MemoizedReactMarkdown } from '../ui/markdown'

const MAX_CONTENT_LENGTH = 1000

export function RetrieveArtifactContent({ tool }: { tool: ToolInvocation }) {
  const searchResults: TypeSearchResults | undefined =
    tool.state === 'result'
      ? (tool.result as TypeSearchResults | undefined)
      : undefined
  const url = tool.args?.url as string | undefined

  if (
    !searchResults ||
    !searchResults.results ||
    searchResults.results.length === 0
  ) {
    return <div className="p-4">No retrieved content</div>
  }

  const truncatedResults: SearchResultItem[] = searchResults.results.map(
    (result: SearchResultItem) => ({
      ...result,
      content:
        result.content.length > MAX_CONTENT_LENGTH
          ? `${result.content.substring(0, MAX_CONTENT_LENGTH)}...`
          : result.content
    })
  )

  return (
    <div className="space-y-2">
      {/* <ToolArgsSection tool="retrieve">{url}</ToolArgsSection> */}

      <Section title="Sources">
        <SearchResults results={truncatedResults} displayMode="list" />
      </Section>
      {truncatedResults[0].content && (
        <Section title="Content">
          <div className="prose-sm prose-neutral prose-p:text-sm text-muted-foreground">
            <MemoizedReactMarkdown
              remarkPlugins={[remarkGfm]}
            >
              {truncatedResults[0].content}
            </MemoizedReactMarkdown>
          </div>
        </Section>
      )}
    </div>
  )
}
