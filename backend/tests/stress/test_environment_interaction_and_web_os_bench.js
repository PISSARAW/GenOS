/**
 * GenOS Environment Interaction & Web/OS Navigation Benchmark Suite
 * High-complexity SSRF, DNS rebinding, OS symlink traversal, VFS limits,
 * and command injection challenges:
 * 1. SSRF & Evasive IP Encoding Interception (Web Navigation)
 * 2. Public Webhook Target Assertion & DNS Rebinding / TOCTOU Defense
 * 3. OS Filesystem Navigation & Symlink Traversal Lockdown
 * 4. VFS Resource Limits & Anti-DoS File Bombs
 * 5. OS Terminal Command Sanitization & Anti-Subshell Injections
 * 6. Web URL Protocol Sanitization & Credential Stripping
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { isBlockedAddress, isLoopbackHostname, validateProviderEndpoint } = require('../../src/services/providerEndpointPolicy');
const { resolvePublicWebhookTarget } = require('../../src/services/webhookService');
const { resolveWorkspaceRoot, resolveContainedPathNoSymlinkSync, normalizeRelativePath } = require('../../src/services/pathSafety');
const { normalizeFileArguments, calculateBlastRadius } = require('../../src/services/vfsSandboxService');
const { isAllowedSandboxTestCommand } = require('../../src/services/sandboxCommandPolicy');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passed += 1;
          console.log(`  [PASS] ${name}`);
        })
        .catch((err) => {
          failed += 1;
          console.error(`  [FAIL] ${name}: ${err.message}`);
        });
    }
    passed += 1;
    console.log(`  [PASS] ${name}`);
    return Promise.resolve();
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}: ${err.message}`);
    return Promise.resolve();
  }
}

async function testSsrfAndEvasiveIpEncodings() {
  console.log('\n--- Challenge 1: SSRF & Evasive IP Encoding Interception ---');
  console.log('  Competitor Failure: Fails to parse octal/hex/IPv6 encodings, exposing cloud metadata.');

  await runTest('1.1 Intercept evasive octal, hex, and integer loopback representations', () => {
    assert.strictEqual(isLoopbackHostname('127.0.0.1'), true);
    assert.strictEqual(isLoopbackHostname('0177.0.0.1'), true, 'Octal loopback');
    assert.strictEqual(isLoopbackHostname('0x7f.0.0.1'), true, 'Hex loopback');
    assert.strictEqual(isLoopbackHostname('2130706433'), true, 'Dword integer loopback');
    assert.strictEqual(isLoopbackHostname('localhost'), true);
  });

  await runTest('1.2 Block AWS, GCP, and Alibaba cloud metadata IP endpoints', () => {
    assert.strictEqual(isBlockedAddress('169.254.169.254'), true, 'AWS metadata IPv4');
    assert.strictEqual(isBlockedAddress('100.100.100.200'), true, 'Alibaba metadata IPv4');
    assert.strictEqual(isBlockedAddress('metadata.google.internal'), true, 'GCP metadata hostname');
    assert.strictEqual(isBlockedAddress('metadata.amazonaws.com'), true, 'AWS metadata hostname');
  });

  await runTest('1.3 Intercept IPv6-mapped IPv4 private and metadata addresses', () => {
    assert.strictEqual(isBlockedAddress('[::ffff:169.254.169.254]'), true, 'IPv6 mapped AWS metadata');
    assert.strictEqual(isLoopbackHostname('[::ffff:127.0.0.1]'), true, 'IPv6 mapped loopback');
    assert.strictEqual(isBlockedAddress('[::ffff:10.0.0.1]'), true, 'IPv6 mapped private 10.x');
    assert.strictEqual(isLoopbackHostname('[::1]'), true, 'IPv6 native loopback');
  });
}

async function testWebhookAndDnsRebinding() {
  console.log('\n--- Challenge 2: Public Webhook Assertion & Rebinding Defense ---');
  console.log('  Competitor Failure: Trusting URLs without pinning permits DNS rebinding (TOCTOU).');

  await runTest('2.1 Rejection of non-HTTPS schemes for public webhooks', async () => {
    await assert.rejects(
      () => resolvePublicWebhookTarget('http://api.github.com/webhook'),
      /Webhook URL must use HTTPS/
    );
  });

  await runTest('2.2 Rejection of internal and reserved hostname patterns', async () => {
    await assert.rejects(
      () => resolvePublicWebhookTarget('https://localhost/webhook'),
      /must not target internal hostnames/
    );
    await assert.rejects(
      () => resolvePublicWebhookTarget('https://service.internal/webhook'),
      /must not target internal hostnames/
    );
    await assert.rejects(
      () => resolvePublicWebhookTarget('https://app.local/webhook'),
      /must not target internal hostnames/
    );
  });

  await runTest('2.3 Rejection of unresolvable or bogus domains', async () => {
    await assert.rejects(
      () => resolvePublicWebhookTarget('https://non-existent-domain-xyz-449.invalid/hook'),
      /Webhook hostname does not resolve/
    );
  });
}

async function testOsFilesystemAndSymlinks() {
  console.log('\n--- Challenge 3: OS Filesystem Navigation & Symlink Lockdown ---');
  console.log('  Competitor Failure: Following symlinks escapes project directory into host root.');

  await runTest('3.1 Filesystem root rejection: cannot declare system root as workspace', () => {
    const root = path.parse(process.cwd()).root;
    assert.throws(() => {
      resolveWorkspaceRoot(root);
    }, /must not be a filesystem root/);
  });

  await runTest('3.2 Non-existent directory rejection for workspace initialization', () => {
    assert.throws(() => {
      resolveWorkspaceRoot('/non_existent_folder_abc_123');
    }, /no such file or directory|must be an existing directory/);
  });

  await runTest('3.3 Symlink traversal lockdown halts on links pointing outside workspace', () => {
    // Create temporary workspace with an internal symlink and external target
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos_symlink_test_'));
    const safeSub = path.join(tmpDir, 'safe_sub');
    fs.mkdirSync(safeSub);
    const safeFile = path.join(safeSub, 'data.txt');
    fs.writeFileSync(safeFile, 'hello safe');

    try {
      // 1. Valid contained path resolves properly
      const resolved = resolveContainedPathNoSymlinkSync(tmpDir, 'safe_sub/data.txt');
      assert.strictEqual(resolved, safeFile);

      // 2. Symlink creation test (if OS permissions allow)
      const linkPath = path.join(tmpDir, 'rogue_link');
      try {
        fs.symlinkSync(os.tmpdir(), linkPath, 'junction');
        // If symlink succeeded, resolveContainedPathNoSymlinkSync must block traversal
        assert.throws(() => {
          resolveContainedPathNoSymlinkSync(tmpDir, 'rogue_link/some_file.txt');
        }, /traverses a symbolic link/);
      } catch (symlinkErr) {
        if (symlinkErr.code !== 'EPERM') throw symlinkErr;
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}

async function testVfsQuotasAndAntiDos() {
  console.log('\n--- Challenge 4: VFS Resource Limits & Anti-DoS File Bombs ---');
  console.log('  Competitor Failure: Allows unbounded file creation leading to host OOM / disk exhaustion.');

  await runTest('4.1 VFS normalization mandates canonical path and string content fields', () => {
    const fileArgs = normalizeFileArguments({ path: 'src/app.js', content: 'console.log(1);' });
    assert.strictEqual(fileArgs.path, 'src/app.js');
    assert.strictEqual(fileArgs.content, 'console.log(1);');

    assert.throws(() => {
      normalizeFileArguments({ TargetFile: 'src/app.js', CodeContent: 'code' });
    }, /canonical path and content fields/);
  });

  await runTest('4.2 High blast radius score for bulk file modifications', () => {
    // Modifying 10 files with destructive action
    const bulkScore = calculateBlastRadius(10, true, 'admin');
    // 5 base + 45 (capped files) + 35 destructive + 15 admin = 100
    assert.strictEqual(bulkScore, 100);

    const minorScore = calculateBlastRadius(1, false, 'operator');
    // 5 base + 15 = 20
    assert.strictEqual(minorScore, 20);
  });
}

async function testTerminalCommandSanitization() {
  console.log('\n--- Challenge 5: OS Terminal Command Sanitization ---');
  console.log('  Competitor Failure: Shell chaining allows arbitrary host commands.');

  await runTest('5.1 Permitted sandbox build/test commands pass verification', () => {
    assert.strictEqual(isAllowedSandboxTestCommand('npm test'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test -- --verbose'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('cargo test --workspace'), true);
    assert.strictEqual(isAllowedSandboxTestCommand('pytest'), true);
  });

  await runTest('5.2 Subshells, redirections, and chaining operators are blocked', () => {
    assert.strictEqual(isAllowedSandboxTestCommand('npm test && whoami'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test || echo bypass'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test; cat /etc/passwd'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test | grep test'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test > output.txt'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('npm test $(id)'), false);
  });

  await runTest('5.3 Dangerous system utilities are forbidden', () => {
    assert.strictEqual(isAllowedSandboxTestCommand('curl http://evil.com'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('wget http://evil.com'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('nc -l 4444'), false);
    assert.strictEqual(isAllowedSandboxTestCommand('kill -9 1'), false);
  });
}

async function testWebUrlProtocolSanitization() {
  console.log('\n--- Challenge 6: Web URL Protocol & Credential Sanitization ---');
  console.log('  Competitor Failure: Accepts non-HTTP protocols and embedded basic auth credentials.');

  await runTest('6.1 Reject dangerous URL schemes (file, gopher, ftp)', () => {
    assert.throws(() => {
      validateProviderEndpoint('file:///etc/passwd');
    }, /must use HTTP or HTTPS/);

    assert.throws(() => {
      validateProviderEndpoint('gopher://127.0.0.1:70');
    }, /must use HTTP or HTTPS/);

    assert.throws(() => {
      validateProviderEndpoint('ftp://ftp.example.com/file');
    }, /must use HTTP or HTTPS/);
  });

  await runTest('6.2 Reject embedded basic authentication credentials in URLs', () => {
    assert.throws(() => {
      validateProviderEndpoint('https://admin:supersecret@api.example.com');
    }, /must not embed credentials/);
  });
}

async function main() {
  console.log('======================================================================');
  console.log('   GenOS Environment Interaction & Web/OS Navigation Benchmark Suite');
  console.log('======================================================================');

  await testSsrfAndEvasiveIpEncodings();
  await testWebhookAndDnsRebinding();
  await testOsFilesystemAndSymlinks();
  await testVfsQuotasAndAntiDos();
  await testTerminalCommandSanitization();
  await testWebUrlProtocolSanitization();

  console.log('\n======================================================================');
  console.log(`TOTAL ENVIRONMENT BENCHMARK TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
