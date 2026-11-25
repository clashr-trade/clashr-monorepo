import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {LanguageProvider} from '../components/landing/language-provider';
const render=(element:React.ReactNode)=>renderToStaticMarkup(<LanguageProvider initialLanguage="en">{element}</LanguageProvider>);
import {ClashrLanding} from '../components/landing/clashr-landing';
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
});
