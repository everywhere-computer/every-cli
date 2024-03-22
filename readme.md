# Every CLI

This CLI is a set of utilities for running the [Everywhere Computer](https://docs.everywhere.computer/).

## Installation

```shell
npm i -g @everywhere-computer/every-cli
```

## Usage

### Prerequisites

1. Ensure you have the IPFS daemon running via [ipfs daemon](https://docs.ipfs.tech/how-to/command-line-quick-start/#take-your-node-online) or [IPFS Desktop](https://docs.ipfs.tech/install/ipfs-desktop/)
2. Create a custom TS or Wasm function(or clone TS examples repo [here](https://github.com/everywhere-computer/custom-homestar-functions-ts))

### Creating the Everywhere Computer environment

To start a [Homestar](https://github.com/ipvm-wg/homestar) node, API gateway and [Everywhere Computer control panel](https://github.com/everywhere-computer/control-panel)(control panel support for custom functions is coming soon)

```shell
every dev --fn <PATH_TO_FUNCTION_FILE>
```

#### To create a multi-function Homestar workflow

```shell
every dev --fn <PATH_TO_FUNCTION_FILE> --fn <PATH_TO_OTHER_FUNCTION_FILE>
```
