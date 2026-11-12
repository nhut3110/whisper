import {writeFile} from 'node:fs/promises'
import {brandSvg} from '../frontend/lib/brand.ts'
for(const [file,color] of [['web/whisper-mark.svg','#777'],['art/brand/whisper-logo.svg','#242424'],['art/brand/whisper-logo-dark.svg','#e8e8e8']])await writeFile(file,brandSvg(color)+'\n')
console.log('Generated all W. marks from frontend/lib/brand.ts')
