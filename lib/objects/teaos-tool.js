const tools = {};
const runtime = {
  teaos: require('../../index'),
  getPackages: () => [],
  logReport: () => {}
};

function declare(desc){
  if(desc && (desc.type === 'teaos-tool') && desc.name && (typeof desc.func === 'function')){
    tools[desc.name] = desc.func;
    return true;
  }
  return false;
}

function get(name){
  return tools[name] || null;
}

function setRuntime(nextRuntime){
  if(nextRuntime && nextRuntime.teaos){
    runtime.teaos = nextRuntime.teaos;
  }
  if(nextRuntime && (typeof nextRuntime.getPackages === 'function')){
    runtime.getPackages = nextRuntime.getPackages;
  }
  if(nextRuntime && (typeof nextRuntime.logReport === 'function')){
    runtime.logReport = nextRuntime.logReport;
  }
}

function getTeaos(){
  return runtime.teaos;
}

function getPackages(){
  return runtime.getPackages();
}

function logReport(){
  runtime.logReport();
}

function exec(name, argv){
  const tool = get(name);
  if(!tool){
    return false;
  }
  tool(argv || process.argv);
  return true;
}

exports.declare = declare;
exports.get = get;
exports.exec = exec;
exports.tools = tools;
exports.setRuntime = setRuntime;
exports.getTeaos = getTeaos;
exports.getPackages = getPackages;
exports.logReport = logReport;
