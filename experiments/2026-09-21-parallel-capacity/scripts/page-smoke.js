const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const moduleSource=fs.readFileSync('phase0/parallel_para.js','utf8').replace("if(typeof module!=='undefined')module.exports=ParallelPara;",'');
assert(fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8').includes(moduleSource),'built page embeds the current module exactly');
let source=fs.readFileSync('phase0/tests/test_parallel_page.js','utf8').split('// 2. no worker launch')[0];
// Run the same verified generator in Node's native context to avoid VM-global lookup overhead.
// All Populate event handling and page state still run in the built page context.
source=source.replace('vm.createContext({document:', 'vm.createContext({Math,Date,document:');
source=source.replace('const layoutsBefore=',"ctx.nativeGenerate=require('../../../phase0/parallel_para.js').generateLayout;vm.runInContext('ParallelPara.generateLayout=nativeGenerate',ctx);\nconst layoutsBefore=");
vm.runInThisContext('(function(require){'+source+'\n})',{filename:'populate-smoke.js'})(require);
