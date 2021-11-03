teaos (0.0.2)
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
teaos.use("@something", { resources: '*' }); // somthing/extensions/* are loaded
```


Deploying Rules
---

### Simple Local package

- local package path: lib/{local package}

### Local package with dynamic resource management

- local package path: lib/{local package}
- resource directory: lib/{local package}/extensions
- resource definition files:
  - lib/{local package}/extensions/{resource type}.js
  - lib/{local package}/extensions/{resource type}/index.js
  - lib/{local package}/extensions/{resource type}/{resource name}.js
- test path: lib/{local package}/tests
- resource types:
 - variable: reserved
 - function: { type: 'function', func: Function }
 - operator: reserved
 - command: reserved
 - expression: reserved
 - aspect: reserved

History
---

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
