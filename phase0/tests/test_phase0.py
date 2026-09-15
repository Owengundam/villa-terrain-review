import math,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from run import layout,feasible,rectangle,g,contour_view
from checker import check

class PhaseZeroTests(unittest.TestCase):
    def test_contour_normal_faces_downhill(self):
        class Slope:
            def gradient(self,p):return (1.,-1.)
        contours=[dict(points=[(0,0),(10,10)])]
        v=contour_view((4,5),contours,Slope())
        self.assertAlmostEqual(g.dot(v,g.unit((1,1))),0)
        self.assertLess(g.dot(v,(1,-1)),0)
    def test_parallel_and_staggered_clearance(self):
        boundary=[(0,0),(160,0),(160,180),(0,180)]
        for stagger in [0,.5]:
            v=[math.sin(.2),math.cos(.2)]
            units=layout(boundary,v,11,23,36.05,stagger,.5)
            result=check(dict(boundary=boundary,units=units),{})
            self.assertTrue(result['passed'],result['issues'])
            self.assertGreater(len(units),10)
            for u in units:self.assertAlmostEqual(abs(g.signed_area(u['points'])),253,places=6)
    def test_insufficient_height_is_rejected(self):
        edges=[dict(rear=0,front=1),dict(rear=1,front=2)]
        self.assertFalse(feasible([0,0,0],edges,3,5.25))
        self.assertTrue(feasible([12,6,0],edges,3,5.25))
    def test_positive_cycle_is_rejected(self):
        self.assertFalse(feasible([0,0],[dict(rear=0,front=1),dict(rear=1,front=0)],3,5.25))
    def test_boundary_excludes_large_unit(self):
        self.assertEqual(layout([(0,0),(5,0),(5,5),(0,5)],[0,1],11,23,36.05,0,0),[])
    def test_too_tight_gap_is_not_accepted(self):
        units=[dict(id=str(i),name=str(i),view=[0,1],points=rectangle((i*14,0),[0,1],11,23)) for i in range(2)]
        r=check(dict(boundary=[(-30,-30),(40,-30),(40,40),(-30,40)],units=units),{})
        self.assertFalse(r['passed']);self.assertTrue(any(x['kind']=='side_clearance' for x in r['issues']))

if __name__=='__main__':unittest.main()
