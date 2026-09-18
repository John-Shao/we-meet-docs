"""Run with python3 -m unittest discover -s deploy/aliyun-docs/tests -v.

Node-side self-check: run the Bash script against fake k3s/docker binaries,
temporary registries.yaml fixtures, and a loopback registry stub. No cluster,
registry credential, root access, or outbound network is required.
"""

import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "check-node-registry.sh"
BASH = shutil.which("bash")
CR_HOST = "jusi-cn-guangzhou.cr.volces.com"
CR_PAUSE = CR_HOST + "/we-meet/pause:3.6"

FAKE_K3S = r'''#!/usr/bin/env bash
if [ "${TEST_K3S_FAIL:-}" = "1" ]; then
  echo "ctr: connect: permission denied" >&2
  exit 1
fi
cat "${TEST_IMAGES:?}"
'''

FAKE_DOCKER = r'''#!/usr/bin/env bash
if [ -n "${TEST_DOCKER_IMAGES:-}" ]; then
  printf '%s\n' "${TEST_DOCKER_IMAGES}"
fi
'''

IMAGES_WITH_PAUSE = "\n".join([
    "sha256:0b1c2d3e4f5061728394a5b6c7d8e9f0",
    "docker.io/rancher/mirrored-pause:3.6",
    "docker.io/library/postgres:16-alpine",
    CR_HOST + "/we-meet/impress-backend:fc704e9d",
]) + "\n"

IMAGES_OLDER_PAUSE = "\n".join([
    "docker.io/rancher/mirrored-pause:3.5",
    "docker.io/library/redis:7-alpine",
]) + "\n"

IMAGES_NO_PAUSE = "\n".join([
    "docker.io/library/postgres:16-alpine",
    "docker.io/library/redis:7-alpine",
]) + "\n"

IMAGES_WITH_CR_PAUSE = "\n".join([
    "docker.io/library/postgres:16-alpine",
    CR_PAUSE,
]) + "\n"


class _RegistryStub(BaseHTTPRequestHandler):
    """A reachable registry that requires auth: 401, never 200."""

    def _reply(self):
        self.send_response(401)
        self.end_headers()

    do_GET = _reply
    do_HEAD = _reply

    def log_message(self, *args):
        pass


@unittest.skipUnless(BASH, "Bash is required")
class CheckNodeRegistryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.registries = self.root / "registries.yaml"
        self.images = self.root / "images.txt"
        self.images.write_text(IMAGES_WITH_PAUSE)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name, content in (("k3s", FAKE_K3S), ("docker", FAKE_DOCKER)):
            tool = self.bin / name
            tool.write_text(content)
            tool.chmod(0o755)
        self.server = HTTPServer(("127.0.0.1", 0), _RegistryStub)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.mirror = "http://127.0.0.1:%d" % self.server.server_address[1]

    def posix(self, path):
        return Path(path).as_posix()

    def write_registries(self, docker_mirror=True, cr_auth=True, mirror=None):
        lines = []
        if docker_mirror:
            lines += ["mirrors:", "  docker.io:", "    endpoint:",
                      '      - "%s"' % (mirror or self.mirror)]
        lines += ["configs:", '  "%s":' % CR_HOST, "    auth:",
                  '      username: "test-user"']
        if cr_auth:
            lines.append('      password: "test-pass"')
        self.registries.write_text("\n".join(lines) + "\n")

    def run_check(self, images=None, k3s_fail=False, docker_images=None,
                  extra_env=None):
        if images is not None:
            self.images.write_text(images)
        environment = dict(os.environ)
        for name in ("TEST_IMAGES", "TEST_K3S_FAIL", "TEST_DOCKER_IMAGES",
                     "PAUSE_IMAGE", "REGISTRIES_FILE", "CONTAINERD_CONFIG",
                     "K3S_DATA_DIR", "ALIYUN_DOCKER_MIRROR", "DOCKER_MIRROR",
                     "MIRROR_CANDIDATES", "PROBE_TIMEOUT", "CR_HOST"):
            environment.pop(name, None)
        environment.update(
            PATH=self.posix(self.bin) + os.pathsep + environment["PATH"],
            TEST_IMAGES=self.posix(self.images),
            REGISTRIES_FILE=self.posix(self.registries),
            # Absent paths keep the sandbox-image lookup and disk check off.
            CONTAINERD_CONFIG=self.posix(self.root / "no-containerd-config.toml"),
            K3S_DATA_DIR=self.posix(self.root / "no-data-dir"),
            PROBE_TIMEOUT="5",
            MIRROR_CANDIDATES=self.mirror,
        )
        if k3s_fail:
            environment["TEST_K3S_FAIL"] = "1"
        if docker_images:
            environment["TEST_DOCKER_IMAGES"] = docker_images
        environment.update(extra_env or {})
        return subprocess.run(
            [BASH, self.posix(SCRIPT)], capture_output=True, text=True,
            encoding="utf-8", errors="replace", env=environment, timeout=60,
        )

    def test_healthy_node_passes(self):
        self.write_registries()
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("自检通过", result.stdout)
        self.assertIn("docker.io/rancher/mirrored-pause:3.6", result.stdout)

    def test_missing_mirrors_block_deploy(self):
        self.write_registries(docker_mirror=False)
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("mirrors", result.stdout)
        self.assertIn("daemon.json", result.stdout)

    def test_incomplete_cr_credentials_block_deploy(self):
        self.write_registries(cr_auth=False)
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn(CR_HOST, result.stdout)
        self.assertIn("username", result.stdout)

    @unittest.skipUnless(shutil.which("curl"), "curl is required")
    def test_unreachable_mirror_blocks_deploy_and_probes_candidates(self):
        self.write_registries(mirror="http://127.0.0.1:9")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("127.0.0.1:9", result.stdout)
        self.assertIn("可用候选", result.stdout)
        self.assertIn(self.mirror, result.stdout)

    def test_local_pause_tag_is_offered_for_retag(self):
        self.write_registries()
        result = self.run_check(images=IMAGES_OLDER_PAUSE)
        self.assertEqual(result.returncode, 1)
        self.assertIn("FailedCreatePodSandBox", result.stdout)
        self.assertIn("docker.io/rancher/mirrored-pause:3.5", result.stdout)
        self.assertIn(
            "images tag docker.io/rancher/mirrored-pause:3.5 "
            "docker.io/rancher/mirrored-pause:3.6", result.stdout)

    def test_docker_store_is_offered_as_same_host_source(self):
        self.write_registries()
        result = self.run_check(images=IMAGES_NO_PAUSE,
                                docker_images="rancher/mirrored-pause:3.6")
        self.assertEqual(result.returncode, 1)
        self.assertIn("一个 pause 镜像都没有", result.stdout)
        self.assertIn(
            "docker save rancher/mirrored-pause:3.6 | "
            "sudo k3s ctr -n k8s.io images import -", result.stdout)

    def test_reachable_mirror_gives_pull_and_tag_commands(self):
        self.write_registries()
        result = self.run_check(images=IMAGES_NO_PAUSE)
        self.assertEqual(result.returncode, 1)
        self.assertIn(
            "images pull %s/rancher/mirrored-pause:3.6" % self.mirror,
            result.stdout)
        self.assertIn(
            "images tag  %s/rancher/mirrored-pause:3.6 "
            "docker.io/rancher/mirrored-pause:3.6" % self.mirror, result.stdout)

    def test_custom_pause_image_from_private_registry_is_accepted(self):
        self.write_registries()
        result = self.run_check(images=IMAGES_WITH_CR_PAUSE,
                                extra_env={"PAUSE_IMAGE": CR_PAUSE})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(CR_PAUSE, result.stdout)
        self.assertNotIn("docker.io/" + CR_PAUSE, result.stdout)

    def test_unreadable_containerd_asks_for_sudo(self):
        self.write_registries()
        result = self.run_check(k3s_fail=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("sudo", result.stdout)


if __name__ == "__main__":
    unittest.main()
