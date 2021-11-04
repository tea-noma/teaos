const listeners = {};

let libpath = '../../lib/';

function makeRequirePath(abs){
  for(let i = 0; i < __dirname.length; i++){
    if(__dirname[i] != abs[i]){
      for(; i >=0; i--){
        if((__dirname[i] == '/') || (__dirname[i] == '\\')){
          let ref = '';
          for(let j = i; j < __dirname.length; j++){
            if((__dirname[j] == '/') || (__dirname[j] == '\\')){
              ref += '../';
            }
          }
          return ref + abs.substr(i + 1).replace(/\\/g, '/');
        }
      }
      break;
    }
  }
  return null;
}

function teaos_set(name, value){
	switch(name){
	case 'libpath':
		libpath = value;
		break;
	default:
		break;
	}
}

function teaos_on(scope, handler){
	if(!listeners[scope]){
		listeners[scope] = [];
	}
	listeners[scope].push(handler);
}

function teaos_declare(desc){
	const funcs = listeners["declare"];
	if(funcs){
		for(let i = 0; i < funcs.length; i++){
			funcs[i].apply(null, [desc]);
		}
	}
}

// load modules in statically
function teaos_require(name){
	if(name[0] == '@'){
		const funcs = listeners["require"];
		if(funcs){
			for(let i = 0; i < funcs.length; i++){
				funcs[i].apply(null, [name]);
			}
		}
		return require(libpath + name.substr(1));
	}else{
		return require(name);
	}
}

// load modules in dynamically
function teaos_use(name, options){
  const mod = teaos_require(name);
  let inst = null;
  if(mod.use){
    inst = mod.use(options);
  }else{
    inst = mod;
  }
  if(!mod.hasOwnProperty('__teaos')){
    mod.__teaos = { extensions: teaos_extensions(name) || false };
  }
  if(options && options.resources){
    const extensions = mod.__teaos.extensions;
    if(options.resources == '*'){ // require all resources
      if(extensions){
        for(let k in extensions){
          teaos_require(name + '/lib/extensions/' + k);
        }
      }
    }else if(options.resources instanceof Object){
      for(let kk in options.resources){
        if(extensions[kk]){
          if(options.resources[kk] == '*'){
              teaos_require(name + '/lib/extensions/' + kk);
          }else if(options.resources[kk] instanceof Object){
            for(let k in options.resources[kk]){
              teaos_require(name + '/lib/extensions/' + kk + '/' + k);
            }
          }
        }
      }
    }
  }
  return inst;
}

function teaos_extensions(name){
  if(name[0] == '@'){
    const results = {};
    try {
      const files = fs.readdirSync(libpath + name.substr(1) + '/lib/extensions');
      files.forEach((file) => {
        if(file.indexOf('.') != -1){
          results[file] = true;
        }else{
          const sfiles = fs.readdirSync(libpath + name.substr(1) + '/lib/extensions/' + file);
          if(sfiles.length){
            results[file] = {};
            sfiles.forEach((sfile) => {
              results[file][sfile] = true;
            });
          }
        }
      });
    }catch(err){
    }
    return results;
  }
  return null;
}

exports.makeRequirePath = makeRequirePath;
exports.set = teaos_set;
exports.on = teaos_on;
exports.declare = teaos_declare;
exports.require = teaos_require;
exports.use = teaos_use;
exports.extensions = teaos_extensions;
