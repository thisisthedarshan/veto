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

"""Locate or download the pinned Laya checkpoint beside this VETO checkout."""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = ROOT / "models" / "laya"
MODEL_CONFIG = json.loads((ROOT / "config" / "laya-model.json").read_text())
ALLOW_PATTERNS = ["rl_agent_config.json", "model.safetensors", "tokenizer/*", "encoder/*"]


def ensure_model(snapshot_download=None, model_root=MODEL_ROOT, config=MODEL_CONFIG):
    model_root.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(model_root)
    os.environ["HF_HUB_CACHE"] = str(model_root / "hub")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    if snapshot_download is None:
        from huggingface_hub import snapshot_download as downloader
    else:
        downloader = snapshot_download
    options = dict(
        repo_id=config["repository"],
        revision=config["revision"],
        cache_dir=str(model_root / "hub"),
        allow_patterns=ALLOW_PATTERNS,
    )
    def checked_snapshot(local):
        path = Path(downloader(**options, local_files_only=local))
        for name in ("rl_agent_config.json", "model.safetensors"):
            if not (path / name).is_file():
                raise RuntimeError(f"Pinned Laya checkpoint is incomplete: missing {name}")
        return path

    try:
        return checked_snapshot(True)
    except Exception:
        print(f"VETO: pinned Laya checkpoint missing locally; downloading to {model_root}", file=sys.stderr)
        return checked_snapshot(False)
