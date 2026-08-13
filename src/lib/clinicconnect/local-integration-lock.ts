import { createHash } from 'node:crypto';
import { open, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lockName = `clinicconnect-${createHash('sha256')
  .update(process.cwd())
  .digest('hex')
  .slice(0, 16)}.integration.lock`;
const lockPath = join(tmpdir(), lockName);

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Serializes local integration tests that mutate the shared fixture accounts.
 * The lock lives in the OS temp directory and is never part of the project.
 */
export async function acquireLocalIntegrationLock(
  timeoutMs = 120_000,
): Promise<() => Promise<void>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${process.pid}\n`, 'utf8');
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

      const owner = await readFile(lockPath, 'utf8').catch(() => '');
      const ownerPid = Number.parseInt(owner.trim(), 10);
      if (ownerPid && !processIsAlive(ownerPid)) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Timed out waiting for local integration lock: ${lockPath}`);
}
