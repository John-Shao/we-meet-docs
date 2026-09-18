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

    def test_migrate_pod_is_not_selected_by_the_backend_service_or_pdb(self):
        _, manifest = self.render(60, "b5a4c2b3")
        # 任务 pod 的 labels 必须与 backend Service / PDB 的选择器
        # (`app.kubernetes.io/component: backend`)错开:否则迁移那一二十秒里它会被
        # 当成后端端点(没有 HTTP 进程、也没有 readiness 探针 —— 一启动就 Ready),
        # 请求被轮询到它就会失败;PDB 还会因为它算不出期望副本数而报
        # CalculateExpectedPodCountFailed(Job 不实现 scale 子资源)。
        pod_labels = re.search(
            r"^      labels:\n((?:        .*\n)+)", manifest, re.MULTILINE
        ).group(1)
        self.assertIn("app.kubernetes.io/component: backend-job", pod_labels)
        self.assertNotIn("app.kubernetes.io/component: backend\n", pod_labels)
        # Job 自身仍带 component: backend,按组件筛任务的习惯不受影响。
        self.assertIn("app.kubernetes.io/component: backend\n", manifest)


if __name__ == "__main__":
    unittest.main()
