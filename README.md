teaos (0.1.2)
===

Use local and npm package plugins with a unified runtime loader.


Changelog
---

### 0.1.2 (2026-10-31)

- Added a scoped `teaos-lock.json` with direct dependencies and local library remote URL, commit, and Git tree. `teaos install` restores missing libraries at the locked revision; files-only checkouts use a content hash to detect edits.
- Added `--lock-source=local|remote` (default: `local`). Remote mode checks the published application lock and stages only changed libraries before switching them into place. Previous clean checkouts are retained for recovery; dirty local checkouts are not overwritten.
- Added lightweight local Git snapshot inspection for HEAD, refs, and loose commit trees, with Git fallback for packed objects and Git status for worktree changes. Dependency inspection no longer rewrites an unchanged `teaos.json`.
- Distinguished single-app projects (no `apps/`, root `teaos.json`) from multi-app projects (`apps/` exists). An empty or entirely invalid `apps/` directory now fails; explicit app installation can bootstrap the first app. Root single-app projects also support remote lock mode.
- Added per-repository URL mappings in `teaos.json` (`apps/name` and `lib/name`). App-level mappings override workspace mappings for direct and transitive libraries; resolved URLs are recorded in each app's `teaos-lock.json`. Conflicting app mappings cannot silently reuse the same shared library checkout.

### 0.1.1 (2026-10-31)

- `teaos install` resolves an app's `teaos.json` dependencies recursively; applications may depend on libraries and npm packages, but not other applications.
- Add `--mode=full|shallow|files` for full Git history, a shallow clone, or a checkout without Git metadata. The mode also applies to transitive libraries.
- Add `--user` and `--git-url` to select the GitHub account or repository base URL per command. With no repository setting, Git repositories are not fetched, as before.

### 0.1.0 (2026-10-12)

- Add getContext(), run(context, callback), supportAsyncContext interface
- Add extensionKey() interface. accessable in the handler of teaos.on('declare', handler).

### 0.0.9 (2026-05-07)

- Add resources() interface

### 0.0.8 (2026-05-03)

- Support Nested node_modules 

### 0.0.7 (2026-05-02)

- Added CLI commands `teaos dependencies` and `teaos dependencies-local` to inspect traced dependency results from `teaos.json`.
- Documented recursive API usage for dependency tracing: `teaos.dependencies(lpath, {recursive: true})` and `teaos.localDependencies(lpath, {recursive: true})`.

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
teaos ls resources [PATH] [-r]
```

Prints `teaos.resources({ path: PATH, recursive: true })` when `-r` is specified. The command reads comma-separated `TEAOS_RESOURCE_PREFIXS` and passes it to the API as `teaosResourcePrefixs`.

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
teaos install lib/<libname>
teaos install apps/<appname>
teaos install apps/<appname> --mode=files
teaos install apps/<appname> --mode=shallow
teaos install apps/<appname> --user tea-noma
teaos install apps/<appname> --git-url https://github.com/tea-noma
teaos install apps/<appname> --lock-source=remote
```

Project layouts:

- No `apps/` directory: the root `teaos.json` defines one application and its
  `teaos-lock.json` is stored at the root.
- `apps/` directory present: the project is multi-app. At least one immediate
  child directory must have a `teaos.json` with a nonempty `name` and an optional
  object-valued `dependencies`. A root `teaos install` validates the layout and
  visits only the root host config, if present; install an app from its own
  directory or with `teaos install apps/NAME`. This avoids merging shared npm
  versions sequentially before the multi-app npm constraint resolver exists.
  An empty or entirely invalid `apps/` directory is an error.
  An explicit `teaos install apps/NAME` may create
  the first app and validates its definition after cloning.
- Remote lock mode works from the root of a single-app project or from an app
  scope in a multi-app project. In a multi-app root, specify `apps/NAME` to
  select which remote app lock to use.

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
  - If `lib/<libname>` is missing, clones `<repository base>/<TEAOS_REPO_PREFIX><libname>.git` into `lib/<libname>`.
  - `TEAOS_REPO_PREFIX` is optional (defaults to empty string when undefined).
- `teaos install <name>`
  - Adds `<name>: "*"` to scoped `teaos.json`.
  - Runs npm-style install for the root project (`npm install <name>`), with `node_modules` handled only at project root.
- `teaos install lib/<libname>`
  - Alias for `teaos install @<libname>`.
- `teaos install apps/<appname>`
  - Installs an application repository into `./apps/<appname>` (if not already present).
  - Uses `<repository base>/<APPS_REPO_PREFIX><appname>.git` as clone URL.
  - `APPS_REPO_PREFIX` is optional (defaults to empty string when undefined).
  - If the app has a `teaos.json` (including when already checked out), recursively installs its `@lib` and npm dependencies. Apps cannot depend on other apps; an `apps/...` dependency is rejected.
- `teaos install` (no args)
  - Verifies and reconciles `dependencies` and local modules in the current scope.

Repository selection for `apps/` and `lib/` repositories:

No Git repository is fetched unless a repository source is explicitly set. Use
`--user <GitHub account>` (for example, `--user tea-noma`) to fetch from GitHub,
or `--git-url <repository base URL>` for a custom Git host or a
local `file://` base. Both options accept `--option=value` syntax. If both are supplied,
`--git-url` wins. Without CLI options, `TEAOS_REPO` takes precedence over `TEAOS_USER`;
the project root `.env` is also read. CLI options take precedence over environment variables.
`TEAOS_REPO_PREFIX` and `APPS_REPO_PREFIX` continue to apply to repository names.
Their defaults are empty: `apps/site` resolves to `<base>/site.git` and `@core`
to `<base>/core.git`. Set `APPS_REPO_PREFIX=apps.` and
`TEAOS_REPO_PREFIX=teaos.` for the conventional `<base>/apps.site.git` and
`<base>/teaos.core.git` layout.

Individual repository URLs can be overridden in `teaos.json`:

```json
{
  "name": "site",
  "dependencies": {"@core": "*"},
  "repositories": {
    "lib/core": "https://github.com/example/special-core.git"
  }
}
```

An app's `repositories` applies to its direct and transitive libraries and takes
precedence over the workspace root's mapping. The root `teaos.json` can also map
`apps/site` to an exact URL before that app is installed; this works without a
repository base. Unmapped repositories continue to use the base and prefixes.
In a multi-app workspace, the physical `lib/core` directory is shared: an app
cannot silently reuse a clean checkout from a different explicitly mapped origin.

Git checkout modes:

| Option | Files | Git metadata | History |
| --- | --- | --- | --- |
| `--mode=full` (default) | Latest checkout | Yes | Full clone |
| `--mode=shallow` or `--shallow` | Latest checkout | Yes | Latest commit only (`--depth=1`) |
| `--mode=files` or `--files-only` | Latest checkout | No | None after checkout |

The mode applies to transitively fetched libraries too. `--mode files` is also accepted.
Set `TEAOS_INSTALL_MODE` to choose a default mode (including from the project `.env`);
an explicit command-line option takes precedence. In local-lock mode, existing
directories are left untouched; use remote-lock mode for a validated partial update.
Shallow and files-only modes use Git clone and therefore still require Git access to
private repositories during the build. They do not change how npm packages are installed.
Dependency inspection does not rewrite an existing `teaos.json`. The Git snapshot reader
supports `.git` directories and linked-worktree `.git` files, loose and packed refs,
and detached HEAD. It does not treat an unchanged HEAD as proof that local files are clean.

The lockfile is written beside the scoped `teaos.json` (for example,
`apps/site/teaos-lock.json`). With a lockfile present, `teaos install` uses its
recorded repository URL and commit, even if the remote has newer commits. In the
lock, `packages["@core"].remote` records each library's exact URL and the optional
`application.remote` records the app URL. Existing lock entries take precedence
over later changes to `repositories`; intentionally moving a locked dependency
requires updating its lock entry or regenerating the lock from a clean checkout.
In the default local-lock mode, existing libraries are never overwritten: a dirty or
different Git checkout, or an edited files-only checkout, causes an error.
Without a lockfile, existing libraries
are included only when clean and confirmed at their remote branch tip; otherwise
installation continues but no incomplete lockfile is written. Changing direct
dependencies manually requires a named `teaos install @name` to update the lock.
Npm dependencies remain governed by npm's `package-lock.json`.

For a deployed app, run `teaos install --lock-source=remote` from `apps/<appname>`
or `teaos install apps/<appname> --lock-source=remote` from the workspace root.
The app repository must publish `teaos-lock.json`; the local app `teaos.json`
must already match its direct dependencies. The command checks the remote app
HEAD, fetches its lock only when that revision is new, and compares the recorded
library commits/trees. Changed libraries are prepared separately and switched
into place after validation; unchanged libraries are not fetched. Dirty or
unrecognized local libraries stop the update. Previous clean checkouts remain
in the reported `lib/.teaos-stage-*` backup directory for recovery. With
`--mode=files`, an `application.remote` lock entry, an app repository mapping,
`--git-url`, or `TEAOS_REPO` is needed if the app has no `.git`.
This updates local libraries and the local lock; it does not pull app source or
update npm dependencies beyond npm's own lockfile workflow.

### Planned: shared npm dependency resolution

The project has one root `package.json` and `package-lock.json`, even when it
contains multiple apps. A future `teaos install` update must collect npm semver
ranges from the root app/host, each selected app, and their reachable libraries;
combine requirements for the same npm package as an **AND** constraint; and
choose the newest version satisfying all ranges. An empty intersection must
fail before changing the shared npm installation. This is not implemented in
0.1.2: npm dependencies are still installed by name, one at a time, and
`teaos.json` version ranges are not yet enforced.

### Planned: per-app runtime library resolution for debugging

A future debug mode may load each app's `teaos-lock.json` at runtime and resolve
`teaos.require('@name')` against that app's locked library mapping. This would
allow, for example, Contabo and Cloudflare Workers variants such as `@db` and
`@db--workers` to be tested in one workspace without changing production
resolution. The variants must have separate physical checkout paths; a runtime
alias alone cannot make two repositories coexist in `lib/name`. Module-level
state and `teaos.use()` registrations also need isolation rules before two
variants can run concurrently in one Node.js process. This mode is not part of
0.1.2; the current conflict check remains in effect.


```bash
teaos uninstall <name|@libname>
teaos uninstall lib/<libname>
teaos uninstall apps/<appname>
```

Removes the dependency key from `dependencies` in the current scope's `teaos.json`.

- In `apps/<appname>` scope, also removes the same key from root `teaos.json`.
- In `lib/<libname>` scope, updates only that lib's `teaos.json`.
- `teaos uninstall lib/<libname>` is an alias for uninstalling `@<libname>`.
- `teaos uninstall apps/<appname>` is currently not supported (no-op).
- Does **not** delete `lib/<name>` directories or `node_modules` entries.

```bash
teaos dependencies
teaos dependencies-local
```

Prints traced dependency sets for the current project scope:

- `teaos dependencies` shows all dependency package names (local and npm).
- `teaos dependencies-local` shows only local dependency names (`@...`).

Recursive verification:

- Newly loaded `lib/*/teaos.json` files are read recursively.
- Internal deps (`@...`) are checked against `lib/*` and loaded from the selected repository base when missing.
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

dependency trace API

```javascript
const teaos = require('teaos');

teaos.dependencies(lpath, { recursive: true });
teaos.localDependencies(lpath, { recursive: true });
```

- `lpath`: path to scan (for example, `./lib` or `./apps`).
- `recursive: true`: recursively reads discovered `teaos.json` files and returns accumulated dependencies.

get task context

```javascript
const teaos = require('teaos');
const context = teaos.getContext();
```

get task context in multi-context ( node.js version >= 12.17.0. implemented by AsyncLocalStorage )

```javascript
const teaos = require('teaos');
const context1 = {};
const context2 = {};
teaos.run(context1, () => { ... teaos.getContext(); ... });
teaos.run(context2, () => { ... teaos.getContext(); ... });
```

integrated resources API

```javascript
const teaos = require('teaos');

const resources = teaos.resources({
  teaosResourcePrefixs: ['tea-'],
  recursive: true
});
```

`teaos.resources(options)` scans local package `resources` directories and returns one `Map`. The API does not read environment variables. Pass prefixes with `options.teaosResourcePrefixs`.

When `options.dependencies` is not specified, `teaos.resources()` scans local packages returned by `teaos.localDependencies(currentScope, { recursive: true })` whose package name matches one of the prefixes in `options.teaosResourcePrefixs`. Each matched package contributes files under `lib/<package>/resources` into one `Map`.

When `options.dependencies` is specified, resources are read from those packages instead of using the prefix-filtered local dependency list.

Map keys are resource paths relative to the package `resources` directory. Map values are project-relative file paths to the real files.

```text
lib/AAA/resources/lib/AAA/x.js
lib/BBB/resources/lib/BBB/y.js
```

becomes:

```javascript
Map({
  "lib/AAA/x.js": "./lib/AAA/resources/lib/AAA/x.js",
  "lib/BBB/y.js": "./lib/BBB/resources/lib/BBB/y.js"
})
```

By default, resource scanning is non-recursive and reads only the directory specified by `options.path` (or the package `resources` root when omitted), similar to `fs.readdirSync()`. Set `options.recursive: true` to scan subdirectories recursively. This option controls resource directory traversal only; it is separate from the recursive dependency trace used to discover local dependencies.

If multiple packages provide the same resource key, packages later in `localDependencies(..., { recursive: true })` take priority. Use `teaos.resources({ path: "lib/AAA", recursive: true })` or `teaos ls resources lib/AAA -r` to scan one subtree recursively.

Set `options.multi: true` to preserve all colliding resource entries:

```javascript
Map({
  "aaa.js": [
    "./lib/AAA/resources/aaa.js",
    "./lib/BBB/resources/aaa.js"
  ]
})
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

- version 0.0.9
  - Add integrated `teaos.resources()` support for local package resources
  - Add `teaos ls resources [PATH] [-r]` command
  - Add resource options for dependency selection, recursive scanning, collision arrays, and API-provided prefixes
- version 0.0.8
  - Stable commandline
- version 0.0.7
  - Add `teaos dependencies` and `teaos dependencies-local` commands
  - Add recursive dependency API examples: `teaos.dependencies(lpath, {recursive: true})`, `teaos.localDependencies(lpath, {recursive: true})`
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
