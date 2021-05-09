import {
  parse,
  SFCDescriptor,
  SFCBlock
} from '@vue/component-compiler-utils'
import { VueTemplateCompiler } from '@vue/component-compiler-utils/dist/types'
import * as compiler from 'vue-template-compiler'

export default class VueParser {
  private descriptor: SFCDescriptor

  constructor({ source, filename }: { source: string, filename: string }) {
    this.descriptor = parse({
      source,
      compiler: compiler as VueTemplateCompiler,
      filename
    })
  }

  getStyles(): SFCBlock[] | null {
    return this.descriptor.styles || null
  }
}
