"""Agent VM — Sandbox
Safe, isolated code execution environment for agent-generated code.
"""

import asyncio
import sys
import io
import traceback
import time
from typing import Any, Dict, Optional


SAFE_BUILTINS = {
    "print": print,
    "len": len,
    "range": range,
    "enumerate": enumerate,
    "zip": zip,
    "map": map,
    "filter": filter,
    "sorted": sorted,
    "sum": sum,
    "min": min,
    "max": max,
    "abs": abs,
    "round": round,
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "list": list,
    "dict": dict,
    "set": set,
    "tuple": tuple,
    "isinstance": isinstance,
    "type": type,
    "repr": repr,
}


class SandboxResult:
    def __init__(self, output: str, return_value: Any, error: Optional[str], elapsed: float):
        self.output = output
        self.return_value = return_value
        self.error = error
        self.elapsed = elapsed
        self.success = error is None

    def __repr__(self):
        if self.success:
            return f"<SandboxResult ok return={self.return_value!r} elapsed={self.elapsed:.3f}s>"
        return f"<SandboxResult ERROR: {self.error}>"


class Sandbox:
    """
    Executes Python code strings in a restricted namespace.
    - Captures stdout
    - Timeout enforcement via asyncio
    - No file/network/os access by default
    """

    def __init__(self, timeout: float = 5.0, extra_globals: Optional[Dict] = None):
        self.timeout = timeout
        self.extra_globals = extra_globals or {}

    def run(self, code: str, context: Optional[Dict] = None) -> SandboxResult:
        """Synchronous sandbox execution."""
        namespace = {
            "__builtins__": SAFE_BUILTINS,
            **self.extra_globals,
            **(context or {})
        }

        stdout_capture = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = stdout_capture
        start = time.time()
        return_value = None
        error = None

        try:
            # Try exec with return-value capture via last expression
            compiled = compile(code, "<agent_vm_sandbox>", "exec")
            exec(compiled, namespace)
            return_value = namespace.get("__result__", None)
        except Exception:
            error = traceback.format_exc()
        finally:
            sys.stdout = old_stdout

        elapsed = time.time() - start
        output = stdout_capture.getvalue()
        return SandboxResult(output=output, return_value=return_value, error=error, elapsed=elapsed)

    async def run_async(self, code: str, context: Optional[Dict] = None) -> SandboxResult:
        """Async sandbox execution with timeout."""
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, self.run, code, context),
                timeout=self.timeout
            )
            return result
        except asyncio.TimeoutError:
            return SandboxResult(
                output="",
                return_value=None,
                error=f"Sandbox timeout ({self.timeout}s exceeded)",
                elapsed=self.timeout
            )
