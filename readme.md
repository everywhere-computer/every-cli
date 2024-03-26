# Every CLI

This CLI is a set of utilities for running the [Everywhere Computer](https://docs.everywhere.computer/).

## Installation

```shell
npm i -g @everywhere-computer/every-cli
```

## Usage

### Prerequisites

Create a custom TS or Wasm function(or clone TS examples repo [here](https://github.com/everywhere-computer/custom-homestar-functions-ts))

### Creating the Everywhere Computer environment

To start a [Homestar](https://github.com/ipvm-wg/homestar) node, API gateway, IPFS and [Everywhere Computer control panel](https://github.com/everywhere-computer/control-panel)

```shell
every dev <PATH_TO_FUNCTION_FILE>
```

#### To create a multi-function Homestar workflow

```shell
every dev <PATH_TO_FUNCTION_FILE> <PATH_TO_OTHER_FUNCTION_FILE>
```
