# Phase 2 verification — September 14, 2026

- [Tested live proposal and plan previews](20260914-143915-064904/index.html)
- [Full input snapshot, checks and movement vectors](20260914-143915-064904/report.json)
- [Eight passing Rhino integration checks](integration-20260914-144442/tests.json)
- [Run instructions](../../../phase2/README.md)

The document on port 2000 was `resort planning.3dm`: 144 buildings in six separate spatial layouts (two copies of each A/G/I option). All six proposed layouts pass directional side clearance, overlap and site-boundary checks, with fixed orientation and height. Maximum displacement is 5.943 m, within the default 6 m limit; the lowest measured directional gap is 3.04973 m, satisfying >3 m and the 3.05 m target within model tolerance.

14 standalone geometry/solver tests passed. Eight Rhino integration checks passed, including application to an isolated copy of the real model and forced rollback on a fixture. The active user document was unchanged. The proposal was not applied to the live model.

This is the best candidate found by a bounded local search, not a proven global optimum. The stored report predates an internal fingerprint-format refinement; the integration test independently compared all source footprints, boundaries and block transforms before applying its movements to the copy. The entry point always computes a fresh snapshot and proposal before application.
