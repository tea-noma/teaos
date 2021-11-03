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

exports.makeRequirePath = makeRequirePath;

exports.set = function(name, value){
	switch(name){
	case 'libpath':
		libpath = value;
		break;
	default:
		break;
	}
}

exports.on = function(scope, handler){
	if(!listeners[scope]){
		listeners[scope] = [];
	}
	listeners[scope].push(handler);
}

exports.declare = function(desc){
	const funcs = listeners["declare"];
	if(funcs){
		for(let i = 0; i < funcs.length; i++){
			funcs[i].apply(null, [desc]);
		}
	}
}

exports.require = function(name){
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
