import {UIText} from '@/components/landing/language-provider';

/** Keep shared navigation visible while the destination streams in. */
export default function Loading() {
  return <div role="status" aria-busy="true" className="flex h-full flex-col gap-5 p-4">
    <span className="text-sm text-muted"><UIText text="Loading…"/></span>
    <div className="h-8 w-48 animate-pulse rounded bg-white/[0.06]"/>
    <div className="min-h-48 flex-1 animate-pulse rounded-xl bg-white/[0.03]"/>
  </div>;
}
