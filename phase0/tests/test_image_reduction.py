import json,math,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'phase0'))
from run import Terrain,g
from audit_reduction import facade_levels
from sight import verify_new

class ImageReduction(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report=json.loads((ROOT/'output/checks/image-reduction-20260915/report.json').read_text(encoding='utf8'))
        source=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335-reference.json').read_text(encoding='utf8'))
        cls.terrain=Terrain.__new__(Terrain);cls.terrain.__dict__.update(source['studies'][0]['terrain']);cls.terrain.ny=len(cls.terrain.grid);cls.terrain.nx=len(cls.terrain.grid[0])
    def test_site_and_every_unit(self):
        self.assertAlmostEqual(abs(g.signed_area(self.report['boundary'])),40335.4,places=5)
        for layout in self.report['layouts']:
            for u in layout['units']:
                lengths=sorted(g.length(g.sub(a,b)) for a,b in g.edges(u['points']))
                for actual,expected in zip(lengths,[11,11,23,23]):self.assertAlmostEqual(actual,expected,places=6)
                rear,front=facade_levels(u['center'],u['view'],self.terrain)
                self.assertLess(front,rear-1e-8,(layout['name'],u['id']))
                self.assertLessEqual(abs(u['rotation']),15+1e-8)
                self.assertLessEqual(abs(u['z']-u['reference']),1.5+1e-6)
    def test_all_saved_states_independently(self):
        self.assertEqual(len(self.report['layouts']),4)
        for layout in self.report['layouts']:
            units=[u for u in layout['units'] if u['active']]
            result=verify_new(dict(boundary=self.report['boundary'],units=units),dict(z=[u['z'] for u in units],links=[]),self.terrain,{'pad_limit':1.5})
            self.assertTrue(result['passed'],result)
    def test_named_parallel_units_now_downhill(self):
        units={u['id']:u for u in self.report['layouts'][1]['units']}
        for name in ('V018','V029','V030'):
            rear,front=facade_levels(units[name]['center'],units[name]['view'],self.terrain)
            self.assertGreater(rear-front,.4,name)

if __name__=='__main__':unittest.main()
