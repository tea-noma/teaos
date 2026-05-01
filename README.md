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
teaos ls -l
```

Shows detailed module info including scanned extension details for each local package under `./lib`.

```bash
teaos ls apps
```

If `./apps` exists, lists directories directly under `./apps`.

```bash
teaos ls lib
```

Same output as `teaos ls`.

```bash
teaos extension-types
```

Scans `./lib/*/lib/extensions/*` and prints detected extension types.

```bash
teaos attr <NAME>
```

Prints `teaos.attr(NAME)` for the current project (for example: `root`, `name`, `path.@apps`).

```bash
teaos ls --extension-type <type>
```

Lists tea modules that contain the specified extension type.

```bash
teaos extensions --all
```

Shows all discovered extensions as `<module>.<extension-type>`.

```bash
teaos extensions --type <type>
```

Shows extensions for modules matching the specified extension type.

```bash
teaos extensions --package <name>
```

Shows extensions for the specified tea module.

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


```bash
teaos create app <appname>
```

Creates `apps/<appname>/teaos.json` and `apps/<appname>/index.js`.

```bash
teaos create lib <libname>
```

Creates `lib/<libname>/teaos.json` and `lib/<libname>/index.js`.

```bash
teaos install [<name>|@<libname>]
```

```bash
teaos init
```

Initializes `teaos.json` in the current project root (similar to `npm init` for teaos metadata).

- If `teaos.json` already exists, the command makes no changes.
- If `teaos.json` does not exist, it is created with:
  - `name`: copied from `package.json.name` when available (otherwise directory name)
  - `dependencies`: copied from `package.json.dependencies` when available (otherwise `{}`)

Adds/synchronizes dependencies for the current scope (`project root`, `apps/<appname>`, `lib/<libname>`).

- `teaos install @<libname>`
  - Adds `@<libname>: "*"` to scoped `teaos.json`.
  - If current scope is `apps/<appname>`, also adds the same entry to root `teaos.json`.
  - If `TEAOS_REPO` is set (loaded from root `.env` when present) and `lib/<libname>` is missing, clones `<TEAOS_REPO>/<TEAOS_REPO_PREFIX><libname>.git` into `lib/<libname>`.
  - `TEAOS_REPO_PREFIX` is optional (defaults to empty string when undefined).
- `teaos install <name>`
  - Adds `<name>: "*"` to scoped `teaos.json`.
  - Runs npm-style install for the root project (`npm install <name>`), with `node_modules` handled only at project root.
- `teaos install` (no args)
  - Verifies and reconciles `dependencies` and local modules in the current scope.


```bash
teaos uninstall <name|@libname>
```

Removes the dependency key from `dependencies` in the current scope's `teaos.json`.

- In `apps/<appname>` scope, also removes the same key from root `teaos.json`.
- In `lib/<libname>` scope, updates only that lib's `teaos.json`.
- Does **not** delete `lib/<name>` directories or `node_modules` entries.

Recursive verification:

- Newly loaded `lib/*/teaos.json` files are read recursively.
- Internal deps (`@...`) are checked against `lib/*` and loaded from `TEAOS_REPO` when available.
- npm deps are checked in root `node_modules`, and missing packages are installed.

Dependency format in `teaos.json`:

```json
{
  "name": "@libA",
  "dependencies": {
    "@libB": "*",
    "@libC": "*",
    "libX": "1.0.0"
  }
}
```

Internal modules (`@...`) are always written as `"*"`.

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

project attributes

```javascript
const teaos = require('teaos');

teaos.attr('root'); // project directory absolute path (resolved from app entry / node_modules path)
teaos.attr('name'); // package.json.name -> teaos.json.name -> directory name

teaos.attr('path.@apps'); // "./apps" if ./apps exists
teaos.attr('path.apps'); // absolute path of ./apps if exists

teaos.attr('path.@lib'); // "./lib"
teaos.attr('path.lib'); // absolute path of ../lib if exists

teaos.attr('path.@tests'); // "./tests"
teaos.attr('path.tests'); // absolute path of ../tests if exists
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
