# ChainGrade isolated benchmark

This toolchain runs a benchmark-only native Fabric network. It never invokes Docker and never reads,
starts, stops, or resets `.runtime/native-fabric`.

## Fixed topology and ports

| Component | Ports |
| --- | --- |
| orderer | consensus 17050, admin 17053, operations 19443 |
| Org1 Peer | peer 17051, chaincode 17052, operations 19444 |
| Org2 Peer | peer 19051, chaincode 19052, operations 19445 |
| bootstrap CAs | Org1 17054/19543, Org2 19054/19544, orderer 17055/19545 |
| grade CCAAS | 19999 |
| API | 17300 |

Fresh CA, MSP/TLS identities, ledgers, logs, secrets, and PID files are generated below
`.runtime/benchmark`. CA processes stop after enrollment. Secrets and unsanitized process logs remain ignored by Git.

## Commands

```bash
./infra/benchmark/benchmark.sh preflight
./infra/benchmark/benchmark.sh start
./infra/benchmark/benchmark.sh status
./infra/benchmark/benchmark.sh smoke
./infra/benchmark/benchmark.sh all
./infra/benchmark/benchmark.sh stop
./infra/benchmark/benchmark.sh reset --confirm-reset
```

`all` uses the formal profile: seven variants, concurrency 1/5/10/20, three repeats, ten-second
warm-up and thirty-second sampling. The concurrency order is rotated by repeat. A non-zero exit means
the evidence is incomplete or an invariant failed.

For a fast engineering check, `smoke` uses one second, concurrency one, and one repeat. Environment
variables beginning with `BENCHMARK_` may change the smoke profile, but published formal evidence must
use the defaults.

Tracked evidence is written under `reports/assets/iteration-14-benchmark`. It contains anonymized
request JSONL, resource CSV, environment and ledger snapshots, generated summaries and SVG charts.
Cookie values, passwords, private grade details, hostnames, usernames, absolute paths and raw exception
messages are never written there.

The current execution platform is an explicitly authorized WSL substitute. Generated reports label it
as such and must not be presented as data from the originally designated server.
