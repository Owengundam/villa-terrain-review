"""Run with: python -m unittest discover -s phase2/tests -p test_*.py -v"""
import math, os, sys, unittest
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
import geometry as g
from solver import solve, settings
from checker import check

def building(name,x,y,w=4,h=8,angle=0,fixed=False):
    c,s=math.cos(angle),math.sin(angle)
    pts=[(x+c*a-s*b,y+s*a+c*b) for a,b in [(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]]
    return dict(id=name,name=name,points=pts,view=(-s,c),fixed=fixed)
def study(units,boundary=None): return dict(id='fixture',name='fixture',units=units,boundary=boundary or [(-30,-30),(30,-30),(30,30),(-30,30)])

class Phase2Tests(unittest.TestCase):
    def test_already_clear_is_unchanged(self):
        r=solve(study([building('a',0,0),building('b',10,0)]))
        self.assertEqual(r['status'],'valid'); self.assertEqual(r['cost'],0)
    def test_side_conflict_resolved(self):
        st=study([building('a',0,0),building('b',5,0)])
        r=solve(st); self.assertEqual(r['status'],'valid'); self.assertTrue(check(st,r['moves'])['passed'])
    def test_rotated_overlap(self):
        st=study([building('a',0,0,angle=.4),building('b',3,0,angle=-.3)])
        r=solve(st,dict(time_limit=10.)); self.assertEqual(r['status'],'valid')
    def test_chain_reactions(self):
        st=study([building(str(i),i*5,0) for i in range(3)])
        r=solve(st); self.assertEqual(r['status'],'valid')
    def test_fixed_and_boundary(self):
        st=study([building('a',-7,0,fixed=True),building('b',-2,0)], [(-10,-10),(15,-10),(15,10),(-10,10)])
        r=solve(st); self.assertEqual(r['status'],'valid'); self.assertEqual(r['moves']['a'],[0.,0.])
    def test_unresolved_does_not_claim_infeasible(self):
        st=study([building('a',0,0,fixed=True),building('b',3,0,fixed=True)])
        r=solve(st); self.assertEqual(r['status'],'unresolved'); self.assertIn('not proven',r['optimality'])
    def test_movement_limit(self):
        r=solve(study([building('a',0,0),building('b',0,0)]),dict(max_move=.1))
        self.assertEqual(r['status'],'unresolved')
    def test_front_only_does_not_require_three_m(self):
        self.assertTrue(check(study([building('a',0,0),building('b',0,8.1)]),{})['passed'])
    def test_gap_exactly_three_fails(self):
        self.assertFalse(check(study([building('a',0,0),building('b',7,0)]),{})['passed'])
    def test_both_local_frames_checked(self):
        st=study([building('a',0,0),building('b',0,9,w=8,h=4,angle=math.pi/2)])
        self.assertFalse(check(st,{})['passed'])
    def test_concave_boundary_crossing_with_inside_vertices(self):
        site=[(0,0),(10,0),(10,10),(6,10),(6,4),(4,4),(4,10),(0,10)]
        p=[(2,2),(8,2),(8,8),(2,8)]
        self.assertTrue(all(g.inside(v,site) for v in p)); self.assertFalse(g.contains(site,p))
    def test_touching_site_boundary_allowed(self):
        self.assertTrue(g.contains([(0,0),(10,0),(10,10),(0,10)],[(0,0),(2,0),(2,2),(0,2)]))
    def test_invalid_settings(self):
        for cfg in [dict(margin=0),dict(max_move=-1),dict(clearance=float('nan')),dict(starts=0)]:
            with self.assertRaises(ValueError): settings(**cfg)
    def test_invalid_polygon(self):
        with self.assertRaises(ValueError): solve(study([building('a',0,0)],[(0,0),(10,10),(0,10),(10,0)]))

if __name__=='__main__': unittest.main()
