"""
Code Interpreter - Secure Python code execution in containerized sandbox.

Provides a secure environment for executing untrusted Python code with:
- Network isolation (--network=none)
- Read-only root filesystem (--read-only)
- Resource limits (memory, CPU, timeout)
- Non-root execution (UID 1000)
- Ephemeral containers (--rm)

The SandboxPool provides pre-warming for sub-second execution latency.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import shutil
import subprocess
import time

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from core.constants import DATA_FILES_PATH

logger = logging.getLogger(__name__)

# ============================================
# CONFIGURATION
# ============================================

SANDBOX_IMAGE = "chat-juicer-sandbox:latest"
TIMEOUT_SECONDS = 60
MEMORY_LIMIT = "512m"
CPU_LIMIT = "1.0"
TMP_SIZE = "64m"

# Output settings
CODE_OUTPUT_SUBDIR = "code"
MAX_OUTPUT_SIZE = 10 * 1024 * 1024  # 10MB max output
ALLOWED_OUTPUT_EXTENSIONS = {".png", ".jpg", ".svg", ".csv", ".json", ".txt", ".html", ".pdf"}
MAX_FILES_RETURNED = 10

# Image formats (require base64 encoding in response)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".svg"}
MAX_IMAGE_SIZE_FOR_BASE64 = 5 * 1024 * 1024  # 5MB max for base64 encoding


# ============================================
# DATA CLASSES
# ============================================


@dataclass
class ExecutionResult:
    """Result from code execution in sandbox."""

    success: bool
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    files: list[dict[str, Any]] = field(default_factory=list)
    output_dir: str = ""
    runtime: str = ""
    execution_time_ms: int = 0
    error: str | None = None


# ============================================
# HELPER FUNCTIONS
# ============================================


def _is_image_file(file_path: Path) -> bool:
    """Check if a file is an image based on extension."""
    return file_path.suffix.lower() in IMAGE_EXTENSIONS


def _encode_image_to_base64(file_path: Path) -> str | None:
    """
    Encode image file to base64 string.

    Args:
        file_path: Path to image file

    Returns:
        Base64-encoded string or None if encoding fails or file too large
    """
    try:
        file_size = file_path.stat().st_size
        if file_size > MAX_IMAGE_SIZE_FOR_BASE64:
            logger.warning(f"Image {file_path.name} too large for base64 encoding: {file_size} bytes")
            return None

        with open(file_path, "rb") as f:
            image_data = f.read()
            return base64.b64encode(image_data).decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to encode image {file_path.name}: {e}")
        return None


def _inject_matplotlib_autosave(code: str) -> str:
    """
    Inject matplotlib auto-save code to capture unsaved figures.

    This prepends matplotlib backend configuration and appends
    auto-save logic to capture any figures created but not manually saved.

    Args:
        code: Original Python code from user

    Returns:
        Modified code with matplotlib auto-save injection
    """
    # Prepend: Configure matplotlib for non-interactive backend
    prepend = """# Auto-injected: Configure matplotlib for sandbox
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt

"""

    # Append: Auto-save any unsaved figures
    append = """

# Auto-injected: Save any unsaved matplotlib figures
try:
    import matplotlib.pyplot as plt
    fig_nums = plt.get_fignums()
    if fig_nums:
        for i, num in enumerate(fig_nums, start=1):
            fig = plt.figure(num)
            output_path = f'/workspace/figure_{i}.png'
            fig.savefig(output_path, dpi=150, bbox_inches='tight')
            plt.close(fig)
except Exception as e:
    print(f"Warning: Failed to auto-save matplotlib figures: {e}", file=__import__('sys').stderr)
"""

    return prepend + code + append


# ============================================
# CONTAINER RUNTIME DETECTION
# ============================================


def get_container_runtime() -> str | None:
    """Detect available container runtime (prefer Podman for rootless security)."""
    if shutil.which("podman"):
        return "podman"
    if shutil.which("docker"):
        return "docker"
    return None


def check_sandbox_ready() -> tuple[bool, str]:
    """Check if sandbox image is available."""
    runtime = get_container_runtime()
    if not runtime:
        return False, "No container runtime (Docker/Podman) found"

    # Check if image exists
    result = subprocess.run(
        [runtime, "image", "inspect", SANDBOX_IMAGE],
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return False, f"Sandbox image '{SANDBOX_IMAGE}' not found. Run 'make build-sandbox' to build it."

    return True, f"Sandbox ready ({runtime})"


# ============================================
# SANDBOX POOL (PRE-WARMING)
# ============================================


class SandboxPool:
    """
    Manages warm containers for fast code execution.

    First execution: ~2-3s (cold start - container spawn + imports)
    Subsequent: ~200-500ms (warm container reuse)

    The warm container runs with pre-imported packages and waits for
    code execution requests. Workspace is cleaned between executions.
    """

    def __init__(self) -> None:
        self.warm_container_id: str | None = None
        self.runtime: str | None = get_container_runtime()
        self._lock = asyncio.Lock()

    async def ensure_warm(self) -> bool:
        """Start warm container if not running. Returns True if warm container available."""
        if not self.runtime:
            return False

        async with self._lock:
            if self.warm_container_id and await self._is_alive():
                return True

            # Start new warm container
            self.warm_container_id = await self._start_warm_container()
            return self.warm_container_id is not None

    async def _is_alive(self) -> bool:
        """Check if warm container is still running."""
        if not self.warm_container_id or not self.runtime:
            return False

        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "container",
            "inspect",
            "-f",
            "{{.State.Running}}",
            self.warm_container_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            return stdout.decode().strip() == "true"
        except asyncio.TimeoutError:
            proc.kill()
            logger.warning("Container inspect timed out, assuming dead")
            return False

    async def _cleanup_stale_containers(self) -> None:
        """Kill any orphaned warm containers from previous runs."""
        if not self.runtime:
            return

        # Find containers matching our naming pattern
        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "ps",
            "-q",
            "--filter",
            "name=chat-juicer-sandbox-warm",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()

        container_ids = stdout.decode().strip().split()
        if container_ids and container_ids[0]:
            logger.info("Cleaning up %d stale warm container(s)", len(container_ids))
            for cid in container_ids:
                kill_proc = await asyncio.create_subprocess_exec(
                    self.runtime,
                    "kill",
                    cid,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await kill_proc.wait()

    async def _start_warm_container(self) -> str | None:
        """Start a warm container with pre-imported packages."""
        if not self.runtime:
            return None

        # Clean up any orphaned containers from previous runs
        await self._cleanup_stale_containers()

        logger.info("Starting warm sandbox container...")

        # Start container with security restrictions but no immediate command
        # The container runs sleep infinity and we exec into it
        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "run",
            "-d",  # Detached
            "--rm",  # Remove on exit
            "--name",
            f"chat-juicer-sandbox-warm-{int(time.time())}",
            "--network=none",  # No network access
            "--read-only",  # Read-only root filesystem
            f"--memory={MEMORY_LIMIT}",
            f"--cpus={CPU_LIMIT}",
            "--tmpfs",
            f"/tmp:size={TMP_SIZE}",
            "--tmpfs",
            "/workspace:size=64m",  # Writable workspace for warm container
            "--tmpfs",
            "/sources:size=64m",  # Session source files (read via copy)
            "--tmpfs",
            "/output:size=64m",  # Session output files (read via copy)
            "-w",
            "/workspace",
            SANDBOX_IMAGE,
            "sleep",
            "infinity",  # Keep container running
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error("Failed to start warm container: %s", stderr.decode())
            return None

        container_id = stdout.decode().strip()

        # Fix tmpfs ownership (tmpfs mounts are root-owned by default)
        # Run chown as root so sandbox user (1000) can write to them
        chown_proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "exec",
            "--user",
            "root",
            container_id,
            "chown",
            "-R",
            "1000:1000",
            "/workspace",
            "/sources",
            "/output",
            "/tmp",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await chown_proc.wait()

        logger.info("Warm container started: %s", container_id[:12])
        return container_id

    async def execute(
        self,
        code: str,
        workspace_path: Path,
        session_files_path: Path | None = None,
    ) -> ExecutionResult:
        """
        Execute code in warm container (fast path) or cold container (fallback).

        Args:
            code: Python code to execute
            workspace_path: Host path for workspace (code input + outputs)
            session_files_path: Optional path to session files (sources/, output/) for read access

        Returns:
            ExecutionResult with stdout, stderr, files, and metadata
        """
        start_time = time.time()
        runtime = self.runtime

        if not runtime:
            return ExecutionResult(
                success=False,
                error="No container runtime available",
                execution_time_ms=0,
            )

        # Inject matplotlib auto-save and write code to workspace
        enhanced_code = _inject_matplotlib_autosave(code)
        script_path = workspace_path / "script.py"
        script_path.write_text(enhanced_code, encoding="utf-8")

        # Try warm container first, fall back to cold start
        if await self.ensure_warm() and self.warm_container_id:
            result = await self._execute_warm(code, workspace_path, session_files_path)
        else:
            result = await self._execute_cold(code, workspace_path, session_files_path)

        result.execution_time_ms = int((time.time() - start_time) * 1000)
        result.runtime = runtime
        result.output_dir = str(workspace_path)

        # Collect generated files
        result.files = self._collect_output_files(workspace_path)

        return result

    async def _execute_warm(
        self, code: str, workspace_path: Path, session_files_path: Path | None = None
    ) -> ExecutionResult:
        """Execute code in warm container via docker exec."""
        if not self.runtime or not self.warm_container_id:
            return await self._execute_cold(code, workspace_path, session_files_path)

        try:
            # Copy workspace into container (with timeout)
            if not await self._container_cp(
                f"{workspace_path}/.",
                f"{self.warm_container_id}:/workspace/",
                to_container=True,
            ):
                logger.warning("Failed to copy workspace to warm container, falling back to cold start")
                return await self._execute_cold(code, workspace_path, session_files_path)

            # Copy session files (sources/output) for read access
            if session_files_path:
                sources_path = session_files_path / "sources"
                output_path = session_files_path / "output"
                # Non-critical: log warning but continue if copy fails
                if sources_path.exists() and not await self._container_cp(
                    f"{sources_path}/.",
                    f"{self.warm_container_id}:/sources/",
                    to_container=True,
                ):
                    logger.warning("Failed to copy sources to container")
                if output_path.exists() and not await self._container_cp(
                    f"{output_path}/.",
                    f"{self.warm_container_id}:/output/",
                    to_container=True,
                ):
                    logger.warning("Failed to copy output to container")

            # Execute script with timeout
            proc = await asyncio.create_subprocess_exec(
                self.runtime,
                "exec",
                self.warm_container_id,
                "python",
                "/workspace/script.py",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                # Kill the exec process
                proc.kill()
                await proc.wait()
                return ExecutionResult(
                    success=False,
                    error=f"Execution timed out after {TIMEOUT_SECONDS}s",
                    exit_code=-1,
                )

            # Copy outputs back from container (with timeout)
            if not await self._container_cp(
                f"{self.warm_container_id}:/workspace/.",
                f"{workspace_path}/",
                to_container=False,
            ):
                logger.warning("Failed to copy workspace from container, files may be missing")

            # Copy output directory back (code can write to /output/)
            if session_files_path:
                output_path = session_files_path / "output"
                if output_path.exists() and not await self._container_cp(
                    f"{self.warm_container_id}:/output/.",
                    f"{output_path}/",
                    to_container=False,
                ):
                    logger.warning("Failed to copy output from container")

            # Clean workspace in container for next execution (security)
            # Use timeout to prevent hanging
            cleanup_proc = await asyncio.create_subprocess_exec(
                self.runtime,
                "exec",
                self.warm_container_id,
                "sh",
                "-c",
                "rm -rf /workspace/*",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                await asyncio.wait_for(cleanup_proc.wait(), timeout=10)
            except asyncio.TimeoutError:
                cleanup_proc.kill()
                logger.warning("Workspace cleanup timed out")

            return ExecutionResult(
                success=proc.returncode == 0,
                stdout=stdout.decode("utf-8", errors="replace"),
                stderr=stderr.decode("utf-8", errors="replace"),
                exit_code=proc.returncode or 0,
            )

        except Exception as e:
            logger.warning("Warm execution failed, container may be dead: %s", e)
            # Mark warm container as dead so next call starts fresh
            self.warm_container_id = None
            # Fall back to cold execution
            return await self._execute_cold(code, workspace_path, session_files_path)

    async def _execute_cold(
        self, code: str, workspace_path: Path, session_files_path: Path | None = None
    ) -> ExecutionResult:
        """Execute code in fresh container (cold start)."""
        if not self.runtime:
            return ExecutionResult(
                success=False,
                error="No container runtime available",
            )

        logger.info("Cold start execution (no warm container)")

        # Ensure script exists (should already be written by execute())
        script_path = workspace_path / "script.py"
        if not script_path.exists():
            # Fallback: inject matplotlib auto-save if script not already written
            enhanced_code = _inject_matplotlib_autosave(code)
            script_path.write_text(enhanced_code, encoding="utf-8")

        # Build command args - base configuration
        # Note: We don't use --user because macOS + Podman UID mapping is unreliable.
        # Security is enforced by: --network=none, --read-only, memory/cpu limits, and container isolation.
        cmd_args = [
            self.runtime,
            "run",
            "--rm",  # Remove container after exit
            "--network=none",  # No network access
            "--read-only",  # Read-only root filesystem
            f"--memory={MEMORY_LIMIT}",
            f"--cpus={CPU_LIMIT}",
            "--tmpfs",
            f"/tmp:size={TMP_SIZE}",
            "-v",
            f"{workspace_path}:/workspace:rw",  # Mount workspace
        ]

        # Add session file mounts if available
        if session_files_path:
            sources_path = session_files_path / "sources"
            output_path = session_files_path / "output"
            if sources_path.exists():
                cmd_args.extend(["-v", f"{sources_path}:/sources:ro"])  # Read-only for uploads
            if output_path.exists():
                cmd_args.extend(["-v", f"{output_path}:/output:rw"])  # Read/write for outputs

        # Add working directory and command
        cmd_args.extend(
            [
                "-w",
                "/workspace",
                SANDBOX_IMAGE,
                "python",
                "script.py",
            ]
        )

        proc = await asyncio.create_subprocess_exec(
            *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return ExecutionResult(
                success=False,
                error=f"Execution timed out after {TIMEOUT_SECONDS}s",
                exit_code=-1,
            )

        return ExecutionResult(
            success=proc.returncode == 0,
            stdout=stdout.decode("utf-8", errors="replace"),
            stderr=stderr.decode("utf-8", errors="replace"),
            exit_code=proc.returncode or 0,
        )

    async def _container_cp(self, src: str, dst: str, to_container: bool, timeout: int = 30) -> bool:
        """Copy files to/from container with timeout.

        Args:
            src: Source path
            dst: Destination path
            to_container: True if copying to container, False if from container
            timeout: Timeout in seconds (default 30s)

        Returns:
            True if copy succeeded, False if failed or timed out
        """
        if not self.runtime:
            return False

        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "cp",
            src,
            dst,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            if proc.returncode != 0:
                logger.warning(f"Container cp failed: {stderr.decode()}")
                return False
            return True
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            logger.error(f"Container cp timed out after {timeout}s: {src} -> {dst}")
            return False

    def _collect_output_files(self, workspace_path: Path) -> list[dict[str, Any]]:
        """
        Collect generated output files from workspace.

        For image files, includes base64-encoded content for inline display.
        For other files, includes metadata only (path, size, type).

        Returns:
            List of file metadata dicts with optional base64 content
        """
        files: list[dict[str, Any]] = []

        for file_path in workspace_path.iterdir():
            if file_path.name == "script.py":
                continue  # Skip input script

            if file_path.suffix.lower() not in ALLOWED_OUTPUT_EXTENSIONS:
                continue

            if file_path.stat().st_size > MAX_OUTPUT_SIZE:
                logger.warning(f"Skipping {file_path.name}: exceeds max size {MAX_OUTPUT_SIZE} bytes")
                continue

            if len(files) >= MAX_FILES_RETURNED:
                logger.warning(f"Reached max files limit ({MAX_FILES_RETURNED}), skipping remaining files")
                break

            # Determine MIME type
            mime_types = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".svg": "image/svg+xml",
                ".csv": "text/csv",
                ".json": "application/json",
                ".txt": "text/plain",
                ".html": "text/html",
                ".pdf": "application/pdf",
            }

            file_info: dict[str, Any] = {
                "name": file_path.name,
                "type": mime_types.get(file_path.suffix.lower(), "application/octet-stream"),
                "path": str(file_path),
                "size": file_path.stat().st_size,
            }

            # For images, include base64-encoded content for inline display
            if _is_image_file(file_path):
                base64_content = _encode_image_to_base64(file_path)
                if base64_content:
                    file_info["base64"] = base64_content
                    logger.info(f"Encoded image {file_path.name} to base64 ({len(base64_content)} chars)")

            files.append(file_info)

        return files

    async def shutdown(self) -> None:
        """Kill warm container on application exit."""
        if not self.warm_container_id or not self.runtime:
            return

        logger.info("Shutting down warm sandbox container...")
        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "kill",
            self.warm_container_id,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        self.warm_container_id = None


# ============================================
# GLOBAL SINGLETON
# ============================================

# Use dict container to avoid 'global' statement (PLW0603)
_state: dict[str, SandboxPool | None] = {"pool": None}


def get_sandbox_pool() -> SandboxPool:
    """Get or create the global sandbox pool."""
    if _state["pool"] is None:
        _state["pool"] = SandboxPool()
    pool = _state["pool"]
    assert pool is not None  # For type narrowing
    return pool


async def shutdown_sandbox_pool() -> None:
    """Shutdown the global sandbox pool (call on app exit)."""
    if _state["pool"] is not None:
        await _state["pool"].shutdown()
        _state["pool"] = None


# ============================================
# MAIN TOOL FUNCTION
# ============================================


async def execute_python_code(code: str, session_id: str) -> str:
    """
    Execute Python code in a secure sandbox environment.

    The sandbox has access to:
    - numpy, pandas, matplotlib, scipy, seaborn, scikit-learn
    - pillow, sympy, plotly
    - openpyxl, python-docx, pypdf, python-pptx (office documents)
    - tabulate, faker, dateutil, humanize, pyyaml, lxml (utilities)

    File Access:
    - /workspace: Read/write for code outputs (default working directory)
    - /sources: Read-only access to uploaded source files (session files)
    - /output: Read/write access to session output files (persistent)

    Limitations:
    - No internet access
    - 60 second timeout
    - 512MB memory limit

    Args:
        code: Python code to execute
        session_id: Session ID for workspace isolation

    Returns:
        JSON string with execution results including stdout, files, and metadata
    """
    # Pre-flight check: verify sandbox is available
    ready, message = check_sandbox_ready()
    if not ready:
        logger.error(f"Sandbox not ready: {message}")
        return json.dumps(
            {
                "success": False,
                "error": message,
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "files": [],
                "output_dir": "",
                "runtime": "",
                "execution_time_ms": 0,
            },
            indent=2,
        )

    # Create session-scoped workspace
    workspace_base = (DATA_FILES_PATH / session_id / "output" / CODE_OUTPUT_SUBDIR).resolve()
    workspace_base.mkdir(parents=True, exist_ok=True)

    # Session files path (sources/ and output/ for read access)
    session_files_path = (DATA_FILES_PATH / session_id).resolve()

    # Get sandbox pool and execute
    pool = get_sandbox_pool()
    result = await pool.execute(code, workspace_base, session_files_path)

    # Format response
    response = {
        "success": result.success,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "files": result.files,
        "output_dir": result.output_dir,
        "runtime": result.runtime,
        "execution_time_ms": result.execution_time_ms,
    }

    if result.error:
        response["error"] = result.error

    return json.dumps(response, indent=2)
