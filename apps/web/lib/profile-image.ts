/** Only the dedicated profile-media route may bypass the external image proxy. */
export const isUploadedProfileImage = (url:string) => /^\/api\/product\/v1\/media\/(avatar|banner)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(png|jpg|webp|gif)$/.test(url);
export function isProfileImageUrl(value:string):boolean {
  const url=value.trim();
  if(!url||isUploadedProfileImage(url))return true;
  try{return new URL(url).protocol==='https:';}catch{return false;}
}
