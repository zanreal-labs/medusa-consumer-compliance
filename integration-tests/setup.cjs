/**
 * Medusa's module loader resolves the module under test with Node's own
 * `require`, which vitest does not transform. Registering ts-node (with swc,
 * as the root tsconfig configures) lets that `require` load the TypeScript
 * sources, decorators included.
 */
require("ts-node").register({
  compilerOptions: { module: "commonjs" },
  swc: true,
  transpileOnly: true,
});

/**
 * `@medusajs/test-utils` reports the app's port with `process.send?.(port)`,
 * written for Jest workers. Vitest's forks pool owns the IPC channel and
 * rejects foreign messages, so a bare number is dropped here and everything
 * else still reaches vitest. (The threads pool avoids this but crashes on
 * exit with the native modules a Medusa app loads.)
 */
if (typeof process.send === "function") {
  const send = process.send.bind(process);
  process.send = (message, ...rest) => (typeof message === "number" ? true : send(message, ...rest));
}
