import {describe,it,expect} from 'vitest';
import {renderToString} from 'react-dom/server';
import {LanguageProvider,LanguageSelect,UIText,usePlatformLanguage} from '../components/landing/language-provider';
import type {LandingLanguage} from '../lib/landing-languages';

function Arena() {
  const {language,t}=usePlatformLanguage();
  return <main lang={language}><h1>{t('Trenches')}</h1><UIText text="New pairs"/><LanguageSelect/></main>;
}
function render(language:LandingLanguage) {
  return renderToString(<LanguageProvider initialLanguage={language}><Arena/></LanguageProvider>);
}

describe('language on the first server render',()=>{
  it('does not reference an absent listbox or expose tree-dependent IDs while closed',()=>{
    const element=<LanguageProvider initialLanguage="en"><LanguageSelect/></LanguageProvider>;
    const server=renderToString(element,{identifierPrefix:'server-tree-'});
    const client=renderToString(element,{identifierPrefix:'client-tree-'});
    expect(client).toBe(server);
    expect(server).toContain('aria-expanded="false"');
    expect(server).toContain('aria-haspopup="listbox"');
    expect(server).not.toContain('aria-controls=');
    expect(server).not.toContain('role="listbox"');
  });
  it('renders English arena labels and selector before any browser scripts run',()=>{
    const html=render('en');
    expect(html).toContain('lang="en"');
    expect(html).toContain('Trenches');
    expect(html).toContain('New pairs');
    expect(html).toContain('English');
    expect(html).not.toContain('交易前线');
    expect(html).not.toContain('新交易对');
  });
  it('renders Japanese immediately when that is the saved preference',()=>{
    const html=render('ja');
    expect(html).toContain('lang="ja"');
    expect(html).toContain('日本語');
    expect(html).not.toContain('新交易对');
  });
  it('keeps server preferences isolated across visitors and retains the Chinese default',()=>{
    render('en');
    const chinese=render('zh-CN');
    expect(chinese).toContain('lang="zh-CN"');
    expect(chinese).toContain('新交易对');
    expect(render('en')).toContain('New pairs');
    expect(renderToString(<LanguageProvider><UIText text="New pairs"/></LanguageProvider>)).toContain('新交易对');
  });
});
