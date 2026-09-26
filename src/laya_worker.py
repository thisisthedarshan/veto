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
import sys
from importlib import metadata
from model_cache import ensure_model

if metadata.version("laya") != "0.3.20":
    raise RuntimeError("VETO requires laya==0.3.20")

snapshot = ensure_model()

from laya import Router  # noqa: E402 - cache variables must be set first
from model_cache import MODEL_CONFIG  # noqa: E402


def main():
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
