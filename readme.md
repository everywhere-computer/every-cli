# Every CLI

This CLI is a set of utilities for running the [Everywhere Computer](https://docs.everywhere.computer/).

## Installation

```shell
npm i -g @everywhere-computer/every-cli
```

## Usage

### Generating .wasm files from TypeScript files

_Note: this will soon support relative paths_

#### Generating the .wasm file and adding it to `IPFS`(this assumes you already have `IPFS` running)

```shell
every dev --fn <ABSOLUTE_PATH_TO_TS_FUNCTION_FILE>
```

### Creating the Everywhere Computer environment

To start a [Homestar](https://github.com/ipvm-wg/homestar) node, API gateway and [Everywhere Computer control panel](https://github.com/everywhere-computer/control-panel)(control panel support for custom functions is coming soon)

```shell
every dev
```

https://blog.dennisokeeffe.com/blog/2021-12-09-generating-json-schema-from-typescript-types

https://github.com/json-schema-form-element
