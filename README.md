teaos (0.0.5)
===

use local npm package

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

local packages (lib/{package})

```javascript
const teaos = require('teaos');
teaos.require("@something");
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

dynamic configurable local packages

```javascript
const teaos = require('teaos');
teaos.use("@something", { resources: '*' }); // somthing/lib/extensions/* are loaded
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
  - **variable**: general variable (reserved)
  - **function**: { type: 'function', func: Function }
  - **operator**: general operator (reserved)
  - **command**: command as operator (reserved)
  - **expression**: expression as operator (reserved)
  - **aspect**: aspect to context (reserved)

Theory
---

![image](https://git.tea-assets.com/teaos/teaos/raw/branch/master/doc/operator.tex.png)

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
