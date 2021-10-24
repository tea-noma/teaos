teaos (0.0.0)
===

use local npm package

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


### History ###

- version 0.0.0
 - support teaos.require()
 - support teaos.declare(desc)
 - support teaos.on(name, handler)
