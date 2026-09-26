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

"""Direct, project-local Laya model worker. One JSON object per line on stdio."""

import contextlib
import json
import os
import sys
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = ROOT / "models" / "laya"
MODEL_ROOT.mkdir(parents=True, exist_ok=True)
os.environ["HF_HOME"] = str(MODEL_ROOT)
os.environ["HF_HUB_CACHE"] = str(MODEL_ROOT / "hub")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

if metadata.version("laya") != "0.3.20":
    raise RuntimeError("VETO requires laya==0.3.20")

from laya import Router  # noqa: E402 - cache variables must be set first
from huggingface_hub import snapshot_download  # noqa: E402

MODEL_CONFIG = json.loads((ROOT / "config" / "laya-model.json").read_text())


def main():
    snapshot = snapshot_download(
        repo_id=MODEL_CONFIG["repository"],
        revision=MODEL_CONFIG["revision"],
        cache_dir=str(MODEL_ROOT / "hub"),
        local_files_only=True,
        allow_patterns=["rl_agent_config.json", "model.safetensors", "tokenizer/*", "encoder/*"],
    )
    router = Router(device="cpu", models={MODEL_CONFIG["checkpoint"]: snapshot})
    for raw in sys.stdin:
        request = None
        try:
            if len(raw) > 65536:
                raise ValueError("request too large")
            request = json.loads(raw)
            if request.get("model") != "english":
                raise ValueError("unsupported model")
            with contextlib.redirect_stdout(sys.stderr):
                result = router.predict(request["state"], request["questions"], model="english")
            response = {"id": request["id"], "result": result}
        except Exception as exc:
            response = {"id": request.get("id") if isinstance(request, dict) else None,
                        "error": f"{type(exc).__name__}: {exc}"}
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
