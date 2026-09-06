const { execFileSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const projectRoot = join(__dirname, '..');
const compiler = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const testFiles = [
  'scratch/test_logic.ts',
  'scratch/test_bot_logic.ts',
  'scratch/testBots.ts',
  'scratch/test_thirteen.ts',
  'scratch/test_hearts.ts',
  'scratch/test_landlord.ts',
];

if (!existsSync(compiler)) {
  throw new Error('找不到專案內的 TypeScript 編譯器，請先安裝相依套件。');
}

const outputDirectory = join(projectRoot, '.test-output');
rmSync(outputDirectory, { recursive: true, force: true });

try {
  execFileSync(process.execPath, [
    compiler,
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--skipLibCheck',
    '--rootDir', projectRoot,
    '--outDir', outputDirectory,
    ...testFiles.map((file) => join(projectRoot, file)),
  ], { cwd: projectRoot, stdio: 'inherit' });

  for (const testFile of testFiles) {
    console.log(`\n=== ${testFile} ===`);
    execFileSync(process.execPath, [join(outputDirectory, testFile.replace(/\.ts$/, '.js'))], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
