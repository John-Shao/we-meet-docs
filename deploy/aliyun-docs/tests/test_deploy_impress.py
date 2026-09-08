"""Run with python3 -m unittest discover -s deploy/aliyun-docs/tests -v.

Exercise real Git checkouts and the Bash entrypoint against fake cluster tools.
No production credentials, image registry, or Kubernetes context are accessed.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "deploy-impress.sh"
FAKE_TOOL = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

name = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ['TEST_LOG'], 'a') as stream:
    stream.write(json.dumps([name, *args]) + '\n')
if name == 'helm':
    values = Path(args[args.index('-f') + 1]).read_text()
    assert 'DOCS_CLIENT_SECRET' not in values, values
    assert 'test-secret' in values, values
    if any(arg.startswith('--dry-run') for arg in args):
        print(values)  # The release script must suppress this sensitive output.
    sys.exit(int(os.environ.get('HELM_EXIT', '0')))
if name == 'kubectl':
    if 'rollout' in args:
        sys.exit(int(os.environ.get('ROLLOUT_EXIT', '0')))
    if 'deployments' in args and 'name' in args:
        if os.environ.get('EMPTY_DEPLOYMENTS') != '1':
            for component in ['backend', 'frontend', 'celery-worker', 'y-provider']:
                print('deployment.apps/impress-docs-' + component)
    elif 'events' in args:
        print('FailedCreatePodSandBox: test failure')
    sys.exit(0)
'''


@unittest.skipUnless(shutil.which("bash") and shutil.which("envsubst"),
                     "Bash and envsubst are required")
class DeployImpressTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / "remote.git"
        self.author = self.root / "author"
        self.repo = self.root / "deploy"
        self.log = self.root / "commands.jsonl"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name in ("helm", "kubectl"):
            tool = self.bin / name
            tool.write_text(FAKE_TOOL)
            tool.chmod(0o755)
        self.git(self.root, "init", "--bare", str(self.remote))
        self.git(self.root, "clone", str(self.remote), str(self.author))
        self.git(self.author, "checkout", "-b", "feat/docs-native")
        directory = self.author / "deploy/aliyun-docs"
        directory.mkdir(parents=True)
        (directory / "deploy-impress.sh").write_text(SCRIPT.read_text())
        (directory / "docs.values.yaml").write_text(
            'secret: "${DOCS_CLIENT_SECRET}"\ntag: "${DOCS_IMAGE_TAG}"\n'
        )
        (self.author / "src/helm/impress").mkdir(parents=True)
        (self.author / "src/helm/impress/Chart.yaml").write_text("name: docs\n")
        (self.author / ".gitignore").write_text("secrets.env\n")
        self.commit(self.author, "initial")
        self.git(self.author, "push", "-u", "origin", "feat/docs-native")
        self.git(self.root, "clone", "-b", "feat/docs-native",
                 str(self.remote), str(self.repo))
        self.entrypoint = self.repo / "deploy/aliyun-docs/deploy-impress.sh"
        self.secrets = self.entrypoint.with_name("secrets.env")
        self.secrets.write_text("\n".join(
            name + "=test-secret" for name in (
                "DOCS_CLIENT_SECRET", "DOCS_S2S_TOKEN", "DJANGO_SECRET_KEY",
                "DOCS_DB_PASSWORD", "DOCS_REDIS_PASSWORD", "OSS_AK", "OSS_SK",
                "Y_PROVIDER_API_KEY", "COLLAB_SERVER_SECRET",
            )
        ) + "\n")

    def git(self, directory, *args):
        result = subprocess.run(
            ["git", "-C", str(directory), *args], capture_output=True, text=True,
            env={**os.environ, "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def commit(self, directory, message):
        self.git(directory, "add", ".")
        self.git(directory, "-c", "user.name=Deploy Test", "-c",
                 "user.email=deploy@example.invalid", "commit", "-m", message)

    def run_deploy(self, *args, **extra_env):
        environment = dict(os.environ)
        for name in ("TAG", "DOCS_IMAGE_TAG", "BRANCH", "TIMEOUT",
                     "DOCS_DEPLOY_SOURCE_UPDATED", "HELM_EXIT", "ROLLOUT_EXIT",
                     "EMPTY_DEPLOYMENTS"):
            environment.pop(name, None)
        environment.update(extra_env)
        environment.update(PATH=str(self.bin) + os.pathsep + environment["PATH"],
                           TEST_LOG=str(self.log))
        result = subprocess.run(
            ["bash", str(self.entrypoint), *args], cwd=self.root,
            env=environment, capture_output=True, text=True, timeout=20,
        )
        self.calls = [json.loads(line) for line in self.log.read_text().splitlines()] \
            if self.log.exists() else []
        return result

    def test_pulls_then_uses_new_sha_and_waits_for_every_deployment(self):
        # Update the script itself too: re-entry must execute the new content.
        script = self.author / "deploy/aliyun-docs/deploy-impress.sh"
        script.write_text(script.read_text() + '\necho updated-script-ran\n')
        self.commit(self.author, "updated script")
        self.git(self.author, "push")
        expected = self.git(self.author, "rev-parse", "--short", "HEAD")
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("updated-script-ran", result.stdout)
        helm = next(call for call in self.calls if call[0] == "helm")
        for argument in ("--wait", "--wait-for-jobs", "10m",
                         "frontend.image.tag=" + expected):
            self.assertIn(argument, helm)
        self.assertEqual(sum("rollout" in call for call in self.calls), 4)
        self.assertIn("Docs 更新完成", result.stdout)

    def test_explicit_tag_timeout_and_values_pass_through(self):
        result = self.run_deploy("--tag", "built-tag", "--timeout", "15m",
                                 "--set", "frontend.replicas=2", TAG="env-tag")
        self.assertEqual(result.returncode, 0, result.stderr)
        helm = next(call for call in self.calls if call[0] == "helm")
        self.assertIn("image.tag=built-tag", helm)
        self.assertIn("frontend.replicas=2", helm)
        self.assertIn("15m", helm)
        self.assertTrue(all("--timeout=15m" in call for call in self.calls if "rollout" in call))

    def test_environment_tag_compatibility(self):
        result = self.run_deploy("--skip-git-pull", TAG="built-env-tag")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("image.tag=built-env-tag", next(c for c in self.calls if c[0] == "helm"))

    def test_dry_run_does_not_wait_or_print_credentials(self):
        result = self.run_deploy("--skip-git-pull", "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("rollout" in call for call in self.calls))
        self.assertNotIn("test-secret", result.stdout + result.stderr)
        self.assertNotIn("Docs 更新完成", result.stdout)

    def test_helm_failure_reports_diagnostics_and_preserves_exit_code(self):
        result = self.run_deploy(HELM_EXIT="7")
        self.assertEqual(result.returncode, 7)
        self.assertFalse(any("rollout" in call for call in self.calls))
        self.assertIn("FailedCreatePodSandBox", result.stderr)
        self.assertNotIn("Docs 更新完成", result.stdout)

    def test_rollout_failure_does_not_report_success(self):
        result = self.run_deploy(ROLLOUT_EXIT="9")
        self.assertEqual(result.returncode, 9)
        self.assertIn("FailedCreatePodSandBox", result.stderr)
        self.assertNotIn("Docs 更新完成", result.stdout)

    def test_empty_deployment_list_is_not_success(self):
        result = self.run_deploy(EMPTY_DEPLOYMENTS="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Docs 更新完成", result.stdout)

    def test_dirty_checkout_requires_explicit_skip(self):
        self.entrypoint.with_name("docs.values.yaml").write_text("local change\n")
        result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local changes", result.stderr)
        self.assertEqual(self.calls, [])

    def test_diverged_branch_stops_before_deploy(self):
        (self.author / "remote-change").write_text("remote")
        self.commit(self.author, "remote update")
        self.git(self.author, "push")
        (self.repo / "local-change").write_text("local")
        self.commit(self.repo, "local update")
        result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls, [])

    def test_switches_to_requested_remote_branch(self):
        self.git(self.author, "checkout", "-b", "release/test")
        (self.author / "release-change").write_text("release")
        self.commit(self.author, "release")
        self.git(self.author, "push", "-u", "origin", "release/test")
        result = self.run_deploy("--branch", "release/test")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git(self.repo, "branch", "--show-current"), "release/test")

    def test_skip_allows_detached_head_without_pulling(self):
        self.git(self.repo, "checkout", "--detach")
        result = self.run_deploy("--skip-git-pull")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("Updating source", result.stdout)

    def test_rejects_latest_and_missing_option_value(self):
        for args in (("--tag", "latest"), ("--timeout",), ("--timeout", "0s")):
            with self.subTest(args=args):
                result = self.run_deploy("--skip-git-pull", *args)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
