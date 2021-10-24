const listeners = {};

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
		return require("../../lib/" + name.substr(1));
	}else{
		return require(name);
	}
}
