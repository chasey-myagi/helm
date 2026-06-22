# examples

- **`sample-board.json`** — a real `state.json` an agent produced while using helm to build a small
  URL-shortener service (the eval task). This is exactly the shape the board renders from: `status`,
  `plan` steps, `events`, `decisions` (with an `assumption` flag), `needs`, `artifacts`, and the
  human-owned `steering` block.

- **`record-demo.sh`** — a reproducible live demo. Run it and a board opens that animates through a
  fake "migrate auth → JWT" task, so you can see helm work (and screen-record it for a showcase GIF):

  ```bash
  bash examples/record-demo.sh
  ```

  Then **edit the GOAL in the page** and run the printed `helm … goal` command to watch the steering
  round-trip — the human edits the goal, the agent reads it back. Stop with the printed `helm … stop`.
