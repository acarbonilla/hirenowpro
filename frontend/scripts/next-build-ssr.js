const { spawnSync } = require("child_process");

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.NEXT_DISABLE_SWC_WASM = "1";
delete process.env.TURBOPACK;
delete process.env.NEXT_TURBOPACK;

const nextBin = require.resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
