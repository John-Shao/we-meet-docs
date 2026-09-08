"""Render the migration Job for successive Helm releases without a cluster."""

from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[3]
HELM = shutil.which("helm")


@unittest.skipUnless(HELM, "Helm is required")
class MigrationJobTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.chart = Path(self.temp.name) / "impress"
        shutil.copytree(REPO / "src/helm/impress", self.chart)
        template = self.chart / "templates/backend_job_migrate.yaml"
        # helm template always starts at revision 1. Set release metadata only
        # in this disposable chart to exercise real upgrade revision values.
        template.write_text(
            '{{- $_ := set .Release "Revision" (int .Values.testRevision) -}}\n'
            + template.read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    def render(self, revision, tag, aliyun=True):
        args = [HELM, "template", "impress", str(self.chart), "-n", "docs",
                "--show-only", "templates/backend_job_migrate.yaml",
                "--set", f"testRevision={revision}",
                "--set-string", f"image.tag={tag}"]
        if aliyun:
            args += ["-f", str(REPO / "deploy/aliyun-docs/docs.values.yaml")]
        result = subprocess.run(args, text=True, encoding="utf-8", capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        name = re.search(r"^  name: (.+)$", result.stdout, re.MULTILINE).group(1)
        return name, result.stdout

    def test_retry_with_another_image_creates_a_different_job(self):
        previous, _ = self.render(59, "missing-image")
        current, manifest = self.render(60, "b5a4c2b3")
        self.assertEqual(previous, "impress-docs-backend-migrate-59")
        self.assertEqual(current, "impress-docs-backend-migrate-60")
        self.assertIn("impress-backend:b5a4c2b3", manifest)
        self.assertIn("python manage.py migrate --no-input", manifest)
        self.assertNotIn("helm.sh/hook", manifest)

    def test_same_image_gets_a_fresh_job_on_next_release(self):
        first, _ = self.render(60, "b5a4c2b3")
        second, _ = self.render(61, "b5a4c2b3")
        self.assertNotEqual(first, second)

    def test_default_chart_preserves_legacy_name(self):
        name, _ = self.render(60, "existing-tag", aliyun=False)
        self.assertEqual(name, "impress-docs-backend-migrate")


if __name__ == "__main__":
    unittest.main()
