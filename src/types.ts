import type { SchemaObject } from 'ajv'
import type { JSONSchema7 } from 'json-schema'

export interface ConfigGlobal {
  config: string
}

export interface ConfigDev extends ConfigGlobal {
  fn: string
  wasm: string
  ipfsPort: number
}

export interface Variables {
  fn: string
  schema: SchemaObject
}

export type Entries = Array<[string, JSONSchema7]>
export interface FnOut {
  entries: Entries
  path: string
}
