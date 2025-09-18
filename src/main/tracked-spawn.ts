import { spawn } from "child_process";
import psTree from "ps-tree";

export const spawnWithWatcher = (cmd: string, args: string[], opts: any, onSubProc: (pid: number) => void) => {
  const proc = spawn(cmd, args, opts);

  const seen = new Set<number>();

  const interval = setInterval(() => {
    psTree(proc.pid, (err, children) => {
      if (err) return;
      for (const c of children) {
        const pid = Number(c.PID);
        if (!seen.has(pid)) {
          seen.add(pid);
          onSubProc(pid);
        }
      }
    });
  }, 50);

  proc.on("exit", () => clearInterval(interval));
  return proc;
}

// const p = spawnWithWatcher("node", ["longRunning.js"], {}, pid => {
//   console.log("New subproc:", pid);
// });