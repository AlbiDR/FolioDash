import fc from "fast-check";

// One setting for every property test, so none of them reads the environment. The seed is fixed by default so a
// run is reproducible and a CI failure can be replayed exactly; set FOLIODASH_FC_SEED to another number, and
// FOLIODASH_FC_RUNS to a larger one, to explore. A failing property prints its seed and the shrunk counterexample.
fc.configureGlobal({
  seed: Number(process.env["FOLIODASH_FC_SEED"] ?? 20261118),
  numRuns: Number(process.env["FOLIODASH_FC_RUNS"] ?? 300),
});
