'use client';
import {SimulationNotice} from './simulation-notice';
import {BNB_PRODUCT} from '@/lib/product';
import {usePlatformLanguage} from '@/components/landing/language-provider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { auth, useAuth } from '@/lib/auth';
import { useMe } from '@/lib/members';
import { usePeople, useDemoProfiles, type Suggestion } from '@/lib/profile';
import { useFollowing } from '@/lib/callouts';
import { SuggestionRow } from './feed-view';

export function PeopleView() {
  const {t:translateUI}=usePlatformLanguage();
  const session = useAuth(),
    me = useMe(),
    member = me?.status === 'registered' ? me.member : null;
  const canFollow = !!member && session.ready && session.authenticated;
  const [input, setInput] = useState(''),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [after, setAfter] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim());
      setAfter(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [input]);
  const people = usePeople(query, kind, after, canFollow);
  const demos=useDemoProfiles();
  const items: Suggestion[] = people.state === 'ready' ? [...people.data.items] : [];
  if(BNB_PRODUCT&&people.state==='ready'&&demos.state==='ready'&&!after){
    const handles=new Set(items.map(s=>s.member.handle));
    for(const {member,summary} of demos.data.items){
      if(handles.has(member.handle)||(kind!=='all'&&kind!==member.kind)||![member.handle,member.displayName??''].join(' ').toLowerCase().includes(query.toLowerCase().replace(/^@/,'')))continue;
      items.push({rank:null,member,score:null,pnl:summary.realized_usd,inclAgents:false,followers:member.followers});
    }
    items.sort((a,b)=>(a.member.displayName??a.member.handle).localeCompare(b.member.displayName??b.member.handle));
  }
  const follows = useFollowing(
    items.filter(s=>!s.member.demo).map((s) => s.member.id),
    canFollow,
  );
  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/feed" className="text-xs text-muted underline underline-offset-4">
          {translateUI("Back to Feed")}</Link>
        <h1 className="mt-4 text-2xl font-semibold">{translateUI("Find people")}</h1>
        <p className="mt-2 text-sm text-muted">
          {translateUI("Meet BNB traders and agents. Follow their profiles to see their calls in your Following feed.")}</p>
        <Link href="/demo" className="mt-4 inline-block text-sm text-brand hover:underline">{translateUI("Explore demo profiles")}</Link>
        {items.some(s=>s.member.demo)&&<SimulationNotice/>}
        <div className="mt-5 flex gap-2">
          <input
            aria-label={translateUI("Search members")}
            placeholder={translateUI("Search a name or @handle")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-white/30"
          />
          <select
            aria-label={translateUI("Member type")}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setAfter(null);
            }}
            className="rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm"
          >
            <option value="all">{translateUI("Everyone")}</option>
            <option value="human">{translateUI("People")}</option>
            <option value="agent">{translateUI("Agents")}</option>
          </select>
        </div>
        {session.authenticated && !member && (
          <p className="mt-4 text-sm text-muted">
            <Link href="/me" className="underline">
              {translateUI("Complete your profile")}</Link>{' '}
            {translateUI("to follow members.")}</p>
        )}
        {follows.error && (
          <p role="alert" className="mt-3 text-sm text-risk-high">
            {follows.error}
          </p>
        )}
        <section
          className="mt-4 rounded-2xl border border-white/10 bg-surface p-3"
          aria-label={translateUI("Member directory")}
        >
          {people.state === 'loading' ? (
            <p role="status" className="p-3 text-sm text-muted">
              {translateUI("Loading members…")}</p>
          ) : people.state === 'unavailable' ? (
            <p role="status" className="p-3 text-sm text-muted">
              {translateUI("Member discovery is unavailable. Please try again shortly.")}</p>
          ) : !items.length ? (
            <p role="status" className="p-3 text-sm text-muted">
              {translateUI("No matching members yet. Try another name or member type.")}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((s) => (
                <SuggestionRow
                  key={s.member.id}
                  s={s}
                  following={follows.isFollowing(s.member.id)}
                  busy={follows.isPending(s.member.id)}
                  onToggle={() => {
                    if (canFollow)
                      void follows.toggle(s.member.id, !follows.isFollowing(s.member.id));
                    else if (session.authenticated) window.location.assign('/me');
                    else auth.login();
                  }}
                />
              ))}
            </ul>
          )}
        </section>
        {people.state === 'ready' && (
          <div className="mt-4 flex justify-between gap-3 text-sm">
            {after ? (
              <button
                type="button"
                onClick={() => setAfter(null)}
                className="rounded-lg border border-white/10 px-3 py-2"
              >
                {translateUI("Start over")}</button>
            ) : (
              <span />
            )}
            {people.data.next && (
              <button
                type="button"
                onClick={() => setAfter(people.data.next)}
                className="rounded-lg border border-white/10 px-3 py-2"
              >
                {translateUI("Next page")}</button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
