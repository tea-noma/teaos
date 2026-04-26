const teaos = require('../../index');

const tools = {};
const runtime = {
  getPackages: () => [],
  logReport: () => {}
};

teaos.on('declare', (desc) => {
  if(desc && (desc.type === 'teaos-tool') && desc.name && (typeof desc.func === 'function')){
    tools[desc.name] = desc.func;
  }
});

function get(name){
  return tools[name] || null;
}

function setRuntime(nextRuntime){
  if(nextRuntime && (typeof nextRuntime.getPackages === 'function')){
    runtime.getPackages = nextRuntime.getPackages;
  }
  if(nextRuntime && (typeof nextRuntime.logReport === 'function')){
    runtime.logReport = nextRuntime.logReport;
  }
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

exports.get = get;
exports.exec = exec;
exports.tools = tools;
exports.setRuntime = setRuntime;
exports.getPackages = getPackages;
exports.logReport = logReport;
