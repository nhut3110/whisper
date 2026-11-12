import { readFile } from 'node:fs/promises'
export const musicAssetNames = ['index.html','app.js','style.css','interactions.js','i18n.js']
export async function musicAsset(name) {
  if (!musicAssetNames.includes(name)) throw new Error('Unknown public music asset')
  const source = await readFile((['interactions.js','i18n.js'].includes(name) ? 'web/' : 'experiments/deezer-preview/') + name, 'utf8')
  const styled=name==='style.css'?source+'\n'+await readFile('frontend/scrollbars.css','utf8'):source
  return styled.replaceAll('/interactions.js','/music-beta/interactions.js')
    .replaceAll('/style.css','/music-beta/style.css').replaceAll('/app.js','/music-beta/app.js')
    .replaceAll('/api/search','/music-beta/search').replaceAll("'/i18n.js'","'/music-beta/i18n.js'")
}
