# Copyright 2026 Darshan
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from model_cache import ensure_model  # noqa: E402


class ModelCacheTest(unittest.TestCase):
    def test_uses_pinned_local_snapshot_without_network(self):
        with tempfile.TemporaryDirectory() as temp:
            snapshot = Path(temp) / "snapshot"
            snapshot.mkdir()
            for name in ("rl_agent_config.json", "model.safetensors"):
                (snapshot / name).write_text("test")
            calls = []

            def download(**options):
                calls.append(options)
                return str(snapshot)

            result = ensure_model(download, Path(temp) / "models", {
                "repository": "example/laya", "revision": "pinned-revision"
            })
            self.assertEqual(result, snapshot)
            self.assertEqual(len(calls), 1)
            self.assertTrue(calls[0]["local_files_only"])
            self.assertEqual(calls[0]["revision"], "pinned-revision")

    def test_downloads_only_after_local_miss(self):
        with tempfile.TemporaryDirectory() as temp:
            snapshot = Path(temp) / "snapshot"
            snapshot.mkdir()
            for name in ("rl_agent_config.json", "model.safetensors"):
                (snapshot / name).write_text("test")
            calls = []

            def download(**options):
                calls.append(options["local_files_only"])
                if options["local_files_only"]:
                    raise RuntimeError("snapshot missing")
                return str(snapshot)

            self.assertEqual(ensure_model(download, Path(temp) / "models", {
                "repository": "example/laya", "revision": "pinned-revision"
            }), snapshot)
            self.assertEqual(calls, [True, False])

    def test_rejects_incomplete_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            snapshot = Path(temp) / "snapshot"
            snapshot.mkdir()
            (snapshot / "rl_agent_config.json").write_text("test")
            calls = []

            def download(**options):
                calls.append(options["local_files_only"])
                return str(snapshot)

            with self.assertRaisesRegex(RuntimeError, "model.safetensors"):
                ensure_model(download, Path(temp) / "models", {
                    "repository": "example/laya", "revision": "pinned-revision"
                })
            self.assertEqual(calls, [True, False])

    def test_download_failure_is_not_silently_ignored(self):
        with tempfile.TemporaryDirectory() as temp:
            calls = []

            def download(**options):
                calls.append(options["local_files_only"])
                raise RuntimeError("network unavailable")

            with self.assertRaisesRegex(RuntimeError, "network unavailable"):
                ensure_model(download, Path(temp) / "models", {
                    "repository": "example/laya", "revision": "pinned-revision"
                })
            self.assertEqual(calls, [True, False])


if __name__ == "__main__":
    unittest.main()
