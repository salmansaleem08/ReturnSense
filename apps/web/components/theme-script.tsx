/** Blocking theme bootstrap — avoids light flash when dark is saved (runs before paint). */
export function ThemeScript() {
  const code = `
(function(){
  try {
    var k='rs-theme';
    var t=localStorage.getItem(k);
    var d=document.documentElement;
    if(t==='dark'){ d.classList.add('dark'); }
    else if(t==='light'){ d.classList.remove('dark'); }
    else if(window.matchMedia('(prefers-color-scheme: dark)').matches){ d.classList.add('dark'); }
  } catch(e) {}
})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
