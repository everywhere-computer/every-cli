import type { SchemaObject } from 'ajv'
import type { JSONSchema7 } from 'json-schema'

export interface ConfigGlobal {
  config: string
}

export interface ConfigDev extends ConfigGlobal {
  debug: boolean
  _: string | string[] | undefined
  fn: string | string[] | undefined
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

export interface FnData {
  name: string
  cid: string
  schema: JSONSchema7
  path: string
  args: string[]
}
export type FnsMap = Map<string, FnData>

export type RunResult = {
  headers: { [key: string]: string }
  out: string | number | number[]
  replayed: boolean
  type: string
}
