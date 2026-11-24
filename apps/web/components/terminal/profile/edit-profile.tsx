'use client';

import {usePlatformLanguage} from '@/components/landing/language-provider';
import { useRef, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';
import { patchMe, uploadImage, type ProfileMember } from '@/lib/profile';
import { Modal } from './modal';
import {isProfileImageUrl} from '@/lib/profile-image';
import {iconSrc} from '../bits';

const BIO_MAX = 160;
const NAME_MAX = 40;

/**
 * Edit display name, one-line bio, avatar and banner. Images upload to the API (/v1/me/avatar|banner)
 * when uploads are enabled; otherwise (feature_disabled) an https image URL works as the fallback.
 */
export function EditProfile({ member, onClose, onSaved }: { member: ProfileMember; onClose: () => void; onSaved: () => void }) {
  const {t:translateUI}=usePlatformLanguage();
  const [displayName, setDisplayName] = useState(member.displayName ?? '');
  const [bio, setBio] = useState(member.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(member.avatarUrl ?? '');
  const [bannerUrl, setBannerUrl] = useState(member.bannerUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [uploads,setUploads]=useState({avatar:false,banner:false});
  const uploading=uploads.avatar||uploads.banner;
  const uploadState=(kind:'avatar'|'banner',active:boolean)=>setUploads(previous=>({...previous,[kind]:active}));

  const save = async () => {
    if (busy||uploading)return;
    if (!isProfileImageUrl(avatarUrl) || !isProfileImageUrl(bannerUrl)) return setError('Use an uploaded image or an https:// image link.');
    setBusy(true);
    setError(null);
    const res = await patchMe({
      displayName: displayName.trim() || null,
      bio: bio.replace(/\s+/g, ' ').trim() || null,
      avatarUrl: avatarUrl.trim() || null,
      bannerUrl: bannerUrl.trim() || null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onSaved();
  };

  return (
    <Modal title={translateUI("Edit profile")} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void save();
        }}
      >
        <ImageField label={translateUI("Banner")} hint="Wide image, up to 3 MB" kind="banner" value={bannerUrl} onChange={setBannerUrl} onNote={setNote} disabled={busy} onUploadingChange={uploadState} />
        <ImageField label={translateUI("Avatar")} hint="Square image, up to 1 MB" kind="avatar" value={avatarUrl} onChange={setAvatarUrl} onNote={setNote} disabled={busy} onUploadingChange={uploadState} />
        {note && <p role="alert" className="text-xs text-risk-high">{note}</p>}
        <label className="block">
          <span className="flex justify-between text-xs text-muted">
            <span>{translateUI("Display name")}</span>
            <span>
              {displayName.length}/{NAME_MAX}
            </span>
          </span>
          <input
            value={displayName}
            maxLength={NAME_MAX}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={`@${member.handle}`}
            className="mt-1 w-full rounded-xl border border-white/[0.08] bg-bg px-3 py-2.5 text-sm outline-none focus:border-white/25"
          />
        </label>
        <label className="block">
          <span className="flex justify-between text-xs text-muted">
            <span>{translateUI("Bio (one line)")}</span>
            <span>
              {bio.length}/{BIO_MAX}
            </span>
          </span>
          <input
            value={bio}
            maxLength={BIO_MAX}
            onChange={(e) => setBio(e.target.value.replace(/[\r\n]+/g, ' '))}
            placeholder={translateUI("What do you trade?")}
            className="mt-1 w-full rounded-xl border border-white/[0.08] bg-bg px-3 py-2.5 text-sm outline-none focus:border-white/25"
          />
        </label>
        {error && <p role="alert" className="text-xs text-risk-high">{error}</p>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/[0.08] py-2.5 text-sm text-muted hover:text-ink">
            {translateUI("Cancel")}</button>
          <button type="submit" disabled={busy||uploading} className="rounded-xl bg-ink py-2.5 text-sm font-semibold text-bg hover:bg-white disabled:opacity-50">
            {busy ? translateUI("Saving…") : translateUI("Save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImageField({
  label,
  hint,
  kind,
  value,
  onChange,
  onNote,
  disabled,
  onUploadingChange,
}: {
  label: string;
  hint: string;
  kind: 'avatar' | 'banner';
  value: string;
  onChange: (v: string) => void;
  onNote: (n: string | null) => void;
  disabled:boolean;
  onUploadingChange:(kind:'avatar'|'banner',active:boolean)=>void;
}) {
  const {t:translateUI}=usePlatformLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <div>
      <span className="text-xs text-muted">
        {translateUI(label)} <span className="text-muted/70">· {translateUI(hint)}</span>
      </span>
      <div className="mt-1 flex gap-2">
        <input
          value={value}
          disabled={disabled||uploading}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="https://…"
          className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-bg px-3 py-2 text-sm outline-none focus:border-white/25"
        />
        <button
          type="button"
          disabled={disabled||uploading}
          onClick={() => input.current?.click()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-50"
        >
          <UploadSimple size={14} /> {uploading ? translateUI("Uploading…") : translateUI("Upload")}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if(file.size>(kind==='avatar'?1_000_000:3_000_000))return onNote(`Too large (max ${kind==='avatar'?'1':'3'} MB).`);
            setUploading(true);
            onUploadingChange(kind,true);
            onNote(null);
            const res = await uploadImage(kind, file);
            setUploading(false);
            onUploadingChange(kind,false);
            if (res.ok) onChange(res.url);
            else onNote(res.message);
          }}
        />
      </div>
      {value&&isProfileImageUrl(value)&&<img src={iconSrc(value)} alt={`${label} preview`} className={kind==='avatar'?'mt-2 size-16 rounded-full object-cover':'mt-2 h-24 w-full rounded-xl object-cover'} />}
    </div>
  );
}
