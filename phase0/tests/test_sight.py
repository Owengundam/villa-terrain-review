import sys,unittest,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sight import union,coverage,spans,fit,HALF
from run import rectangle
class Flat:
    def sample(self,p):return 0.
def villa(i,x,y):return dict(id=str(i),name=str(i),points=rectangle((x,y),(0,1),2,2),view=(0,1))
class SightTests(unittest.TestCase):
    def test_union_not_double_counted(self):self.assertAlmostEqual(union([(0,2),(1,3)]),3)
    def test_total_not_per_building(self):
        row=[[(1,-HALF,-HALF/2),(2,HALF/2,HALF)],[],[]]
        self.assertAlmostEqual(coverage(row,[0,0,0])[0],HALF)
    def test_vertical_clearance_removes_obstruction(self):
        row=[[(1,-HALF,HALF)],[]]
        self.assertEqual(coverage(row,[5.25,0])[0],0)
    def test_peripheral_building_excluded(self):
        us=[villa(0,0,0),villa(1,10,10)]
        self.assertFalse(spans(us)[0])
    def test_direct_obstruction_needs_height(self):
        r=fit([villa(0,0,0),villa(1,0,5)],Flat())
        self.assertTrue(r['feasible']);self.assertGreaterEqual(r['z'][0]-r['z'][1],5.25)
    def test_no_120_degree_rule(self):
        r=fit([villa(0,0,0),villa(1,10,10)],Flat())
        self.assertEqual(r['links'],[]);self.assertEqual(r['z'],[0,0])
if __name__=='__main__':unittest.main()
