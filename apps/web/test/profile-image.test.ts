import {describe,it,expect} from 'vitest';
import {isProfileImageUrl,isUploadedProfileImage} from '../lib/profile-image';
describe('profile image URLs',()=>{
  it('accepts uploaded media and HTTPS while rejecting arbitrary local paths and protocols',()=>{
    expect(isProfileImageUrl('/api/product/v1/media/avatar/member/file.png')).toBe(true);
    expect(isProfileImageUrl('/api/product/v1/media/banner/member/file.webp')).toBe(true);
    expect(isProfileImageUrl('https://images.example/avatar.jpg')).toBe(true);
    expect(isProfileImageUrl('')).toBe(true);
    for(const url of ['/api/product/admin','//evil.example/img.png','http://127.0.0.1/img.png','javascript:alert(1)','/api/product/v1/media/avatar/member/../../admin'])
      expect(isProfileImageUrl(url)).toBe(false);
    expect(isUploadedProfileImage('https://images.example/avatar.jpg')).toBe(false);
  });
});
