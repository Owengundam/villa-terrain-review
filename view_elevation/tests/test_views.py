import os,sys,unittest,math
sys.path.insert(0,os.path.dirname(os.path.dirname(__file__)))
from core import heights,links,g,evaluate,solve
from verify import relationships,verify

def unit(name,x,y,angle=0):
    c,s=math.cos(angle),math.sin(angle)
    return dict(id=name,name=name,points=[(x+c*a-s*b,y+s*a+c*b) for a,b in [(-2,-2),(2,-2),(2,2),(-2,2)]],view=(-s,c))
class Flat:
    def sample(self,p): return 0.
class ViewsTests(unittest.TestCase):
    def test_feasible_pair(self):
        r=heights([10,7],[dict(rear=0,front=1)])
        self.assertTrue(r['feasible']); self.assertGreaterEqual(r['z'][0]-r['z'][1],5.25-1e-6)
    def test_chain_exceeds_bounds(self):
        r=heights([0,0,0],[dict(rear=0,front=1),dict(rear=1,front=2)],3)
        self.assertFalse(r['feasible'])
    def test_cycle(self):
        self.assertFalse(heights([0,0],[dict(rear=0,front=1),dict(rear=1,front=0)])['feasible'])
    def test_graph_rebuilt_after_move(self):
        us=[unit('a',0,0),unit('b',0,10),unit('c',0,20)]
        before=links(us,[u['points'] for u in us]); self.assertIn((0,2),[(e['rear'],e['front']) for e in before])
        ps=[u['points'] for u in us]; ps[1]=g.shifted(ps[1],(30,0))
        after=links(us,ps)
        self.assertEqual(set((e['rear'],e['front']) for e in after),set(relationships(us,ps)))
        self.assertIn((0,2),[(e['rear'],e['front']) for e in after if e['cone']])
    def test_rotated_world_checker(self):
        us=[unit('a',0,0,.4),unit('b',3,12,-.2),unit('c',-8,18,.1),unit('d',0,-15)]
        self.assertEqual(set((e['rear'],e['front']) for e in links(us,[u['points'] for u in us])),set(relationships(us,[u['points'] for u in us])))
    def test_both_buildings_are_candidates(self):
        from core import candidates
        us=[unit('a',0,0),unit('b',0,8)]; st=dict(units=us,boundary=[(-30,-30),(30,-30),(30,30),(-30,30)])
        cfg=dict(max_move=20,pad_limit=.1,drop=5.25,seconds=5,evaluations=200)
        state=evaluate(st,[(0,0),(0,0)],Flat(),cfg); ds=list(candidates(st,state,Flat(),cfg))
        self.assertTrue(any(g.length(d[0])>0 and g.length(d[1])==0 for d in ds))
        self.assertTrue(any(g.length(d[1])>0 and g.length(d[0])==0 for d in ds))
        self.assertTrue(any(g.length(d[0])>0 and g.length(d[1])>0 for d in ds))
    def test_fixed_overlap_refused(self):
        st=dict(units=[unit('a',0,0),unit('b',0,0)],boundary=[(-30,-30),(30,-30),(30,30),(-30,30)])
        self.assertEqual(solve(st,Flat(),dict(max_move=20,pad_limit=3,drop=5.25,seconds=1,evaluations=10))['status'],'invalid_input')

if __name__=='__main__': unittest.main()
