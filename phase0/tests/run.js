const {spawnSync}=require('node:child_process');
const suites=process.argv.includes('--circulation')?['test_circulation.js','test_circulation_page.js','test_road_terrain.js','test_network_method.js']:
 ['test_optimized_population.js','test_optimized_page.js','test_view3d.js','test_view3d_page.js','test_auto_mode.js','test_terrain_edit.js','test_terrain_panel.js','test_calculation_overlay.js','test_circulation.js','test_circulation_page.js','test_road_terrain.js','test_network_method.js'];
for(const suite of suites){const result=spawnSync(process.execPath,['phase0/tests/'+suite],{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
