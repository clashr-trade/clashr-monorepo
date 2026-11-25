import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LanguageProvider} from '../components/landing/language-provider';
const render=(element:React.ReactNode)=>renderToStaticMarkup(<LanguageProvider initialLanguage="en">{element}</LanguageProvider>);
import {ClashrLanding} from '../components/landing/clashr-landing';
import {LegalPage} from '../components/landing/legal';
describe('landing section composition',()=>{
 it('renders every referenced section with the default social fallback',()=>{
  const html=render(<ClashrLanding board={<div>Ranking fixture</div>}/>);
  for(const id of ['social','safety','roadmap','community'])expect(html).toContain('id="'+id+'"');
  expect(html).toContain('Ranking fixture');
 });
 it('accepts server-rendered social content without duplicating the fallback',()=>{
  const html=render(<ClashrLanding board={null} social={<div>Server social fixture</div>}/>);
  expect(html).toContain('Server social fixture');expect(html).not.toContain('id="social"');
 });
 it('retains the approved navigation, wordmark and community footer',()=>{
  const html=render(<ClashrLanding board={null}/>);
  const header=html.slice(html.indexOf('<header'),html.indexOf('</header>')+9);
  for(const link of ['/#social','/#safety','/#roadmap'])expect(header).toContain('href="'+link+'"');
  expect(header).toContain('class="clashr-beta">Beta</span>');expect(header).not.toContain('How it works');expect(html).not.toContain('id="how-it-works"');
  const hero=html.slice(html.indexOf('<h1'),html.indexOf('</h1>')+5);
  expect(hero).toContain('clashr-hero-c');expect(hero).toContain('LASHR');expect(hero).not.toContain('<img');
  const footer=html.slice(html.indexOf('<footer'));
  for(const link of ['https://x.com/clashrdottrade','https://t.me/clashrtrade','https://github.com/clashr-trade','/terms','/privacy','/risk'])expect(footer).toContain('href="'+link+'"');
  expect(footer).toContain('Community');expect(footer).toContain('Legal');expect(footer).not.toContain('Read the rules');expect(footer).not.toContain('Agent docs');expect(footer).not.toContain('Token status');
 });

 it('keeps document pages in the dark Clashr frame',()=>{
  const html=render(<LegalPage title="Risk disclosure" intro="Trading risks"><p>Risk content</p></LegalPage>);
  expect(html).toContain('clashr-docs min-h-dvh');expect(html).not.toContain('theme-paper');expect(html).toContain('Risk content');expect(html).toContain('Community');
 });

});
