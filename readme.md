# EveryCLI

The [EveryCLI](https://github.com/everywhere-computer/every-cli) is a set of utilities for running the [Everywhere Computer](https://docs.everywhere.computer/).

## Installation

```shell
npm i -g @everywhere-computer/every-cli
```

## Usage

Full docs can be viewed [here](https://docs.everywhere.computer/everycli/local-dev/).

### Prerequisites

Create a custom TS or Wasm function(or clone TS examples repo [here](https://github.com/everywhere-computer/custom-homestar-functions-ts))

### Creating the Everywhere Computer environment

To start a [Homestar](https://github.com/ipvm-wg/homestar) node, [IPFS node](https://docs.ipfs.tech/install/command-line/#install-official-binary-distributions), API gateway and [Everywhere Computer control panel](https://github.com/everywhere-computer/control-panel)

```shell
every dev <PATH_TO_FUNCTION_FILE>
```

#### To create a multi-function Homestar workflow

```shell
every dev <PATH_TO_FUNCTION_FILE> <PATH_TO_OTHER_FUNCTION_FILE>
```

### Passing your own Homestar config

By default the [EveryCLI](https://github.com/everywhere-computer/every-cli) will use the [default homestar.toml values](https://docs.everywhere.computer/config/homestar) to specify configuration settings for your Homestar node.

If you would like to specify your own `toml` file to be used as the configuration for Homestar, you can use the `--config` argument:

```shell
every cli dev <PATH_TO_YOUR_FUNCTION_DIR>/hello.wasm --config ../<YOUR_CONFIG_FILE_NAME>.toml
```

You can specify as many or as few values in your `toml` file as you like and the [EveryCLI](https://github.com/everywhere-computer/every-cli) will prioritize the values from your config over the default values.

This means, if you only want to specify a different IPFS port, you simply need to create a `toml` file with

```toml
[node.network.ipfs]
port = 5002
```

and the [EveryCLI](https://github.com/everywhere-computer/every-cli) will upload your functions to IPFS on port `5002` and configure Homestar to use IPFS port `5002`, as well.

If you have specified your own config file, the control panel will run locally so its `.env` file can be overwritten if necessary:

```bash
✔ IPFS is running at http://127.0.0.1:5002/debug/vars
✔ Functions parsed and compiled
✔ Homestar is running at http://127.0.0.1:8020
✔ Control Panel is running at http://127.0.0.1:5178

◐ Starting cloudflared tunnel to http://127.0.0.1:3000/

... a QR code ...

➜ Local:    http://127.0.0.1:3000/
➜ Tunnel:   https://sometimes-comical-word-set.trycloudflare.com
```
