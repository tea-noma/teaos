teaos (0.0.6)
===

Use local and npm package plugins with a unified runtime loader.

Installation
---

command line

```bash
npm install -g teaos
teaos ls
```

library

```bash
npm install teaos
```

Usage
---

### Command line

Run in your project root.

```bash
teaos
```

Prints the installed `teaos` package version.

```bash
teaos ls
```

Lists local packages found in `./lib/{package}/index.js`.

```bash
teaos require <package>
teaos use <package>
```

Loads a local package as `@<package>` and prints trace logs (`require` / `declare`).

```bash
teaos require.all
teaos use.all
```

Loads all packages discovered under `./lib`.

```bash
teaos @<package>/<tool> [...args]
teaos <package>/<tool> [...args]
```

Loads an external CLI tool from either:

- `lib/<package>/lib/extensions/teaos-tool/<tool>.js`
- `node_modules/<package>/lib/extensions/teaos-tool/<tool>.js`

### Library API

local packages (lib/{package})

```javascript
const teaos = require('teaos');
teaos.require("@something");
```

npm package plugins

```javascript
const teaos = require('teaos');
const plugin = teaos.require('some-npm-plugin');
```

declare component

```javascript
const teaos = require('teaos');
const desc = { type: "function", func: funcX };
teaos.declare(desc);
```

listen declaration

```javascript
const teaos = require('teaos');
teaos.on("declare", (desc) => {
});
```

dynamic configurable local packages / npm plugins

```javascript
const teaos = require('teaos');
teaos.use("@something", { resources: '*' }); // local package resources
teaos.use("some-npm-plugin", { resources: '*' }); // npm plugin resources
```

Deploying Rules
---

### Simple Local package

- local package path: lib/{local package}

### Local package with dynamic resource management

- local package path: lib/{local package}
- resource directory: lib/{local package}/lib/extensions
- resource definition files:
  - lib/{local package}/lib/extensions/{resource type}.js
  - lib/{local package}/lib/extensions/{resource type}/index.js
  - lib/{local package}/lib/extensions/{resource type}/{resource name}.js
- test path: lib/{local package}/tests
- resource types:
  - **value**: general value (reserved)
  - **variable**: general variable (reserved)
  - **function**: { type: 'function', name: (default: Function.name), func: Function }
  - **operator**: general operator (reserved)
  - **command**: command as operator (reserved)
  - **expression**: expression as operator (reserved)
  - **aspect**: aspect to context (reserved)

Theory
---

![image](https://git.tea-assets.com/teaos/teaos/raw/commit/eff9f0abbdd78b7f0e6022d0c182cead939ff2be/doc/operator.tex.png)

- F: function
- F_a: aspected function
- F_m: composited function (Set model)
- F_c: context (ex. commit, p2p, probe, loging, Kalman filter)
- O_d: operator (ex. integral, decode/encode)
- O_l: linear operator (ex. step function, matrix)
- O_{inverse}: inversable operator
- V: variable
- V_c: composited variable
- Λ: Eigenvalue
- X_c: Eigenvector
- P: Probability density function
- H_e: Entropy

History
---

- version 0.0.6
  - Add support for npm package plugins
  - Improve CLI usage documentation
- version 0.0.5
  - Add Theory
- version 0.0.4
  - SVG to PNG
- version 0.0.3
  - improve trace log
  - add theory doc
- version 0.0.2
  - support teaos.use()
  - support teaos.extensions()
  - support teaos "command use {local package}""
  - support teaos "command require {local package}""
- version 0.0.1
  - add teaos command
  - support command "teaos ls"
  - support 'require' event
- version 0.0.0
  - support teaos.require()
  - support teaos.declare(desc)
  - support teaos.on(name, handler)
  - support 'declare' event
