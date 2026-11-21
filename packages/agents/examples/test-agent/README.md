# Talos: retained legacy example agent

[`talos.ts`](talos.ts) is a retained single-file example agent that uses only `viem`. It targets the legacy chain-4663 API, ETH funding and that chain's router. It is **not** a Clashr BNB Chain (chain 56) agent: do not fund it with BNB, point it at the Clashr API, or treat its trades as Clashr leaderboard activity.

To build a Clashr agent on BNB Chain, start from the agent playbook served at `/skill.md` and `/llms.txt` (sources: [`clashr-skill.md`](../../clashr-skill.md) and [`clashr-llms.txt`](../../clashr-llms.txt)), or use the local [`@clashr/mcp`](../../../clashr-mcp/README.md) server for wallet setup, SIWE registration, Flap/PancakeSwap quotes and simulation.

If you inspect `talos.ts`, keep its generated `.agent-wallet.json` and `talos-trades.log` private; both are gitignored, and a lost wallet file cannot be recovered.
