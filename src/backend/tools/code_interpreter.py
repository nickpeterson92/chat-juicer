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
import contextlib
import json
import logging
import shutil
import subprocess
import time
import uuid

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
ALLOWED_OUTPUT_EXTENSIONS = {".png", ".jpg", ".svg", ".csv", ".json", ".txt", ".html", ".pdf", ".xlsx", ".docx"}
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

    _initialized: bool = False
    _available: asyncio.Queue[str]
    _all_containers: set[str]
    _lock: asyncio.Lock

    async def initialize(self) -> None:
        """Start warm containers for the pool."""
        if not self.runtime:
            return

        async with self._lock:
            if self._initialized:
                return

            # Clean up any orphaned containers from previous runs first
            await self._cleanup_stale_containers()

            logger.info(f"Initializing sandbox pool with {self.pool_size} containers")
            tasks = [self._start_warm_container(i) for i in range(self.pool_size)]
            container_ids = await asyncio.gather(*tasks)

            for cid in container_ids:
                if cid:
                    await self._available.put(cid)
                    self._all_containers.add(cid)

            self._initialized = True

    async def _stop_container(self, container_id: str) -> None:
        """Stop a single container gracefully (or kill it)."""
        if not self.runtime:
            return

        logger.info(f"Stopping container {container_id}...")
        try:
            # Force remove the container (kill + rm)
            proc = await asyncio.create_subprocess_exec(
                self.runtime,
                "rm",
                "-f",
                container_id,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
        except Exception as e:
            logger.warning(f"Error stopping container {container_id}: {e}")

    async def shutdown(self) -> None:
        """Stop all warm containers."""
        if not self.runtime:
            return

        async with self._lock:
            logger.info("Shutting down sandbox pool...")
            tasks = [self._stop_container(cid) for cid in self._all_containers]

            await asyncio.gather(*tasks)
            self._all_containers.clear()
            # Drain queue
            while not self._available.empty():
                with contextlib.suppress(asyncio.QueueEmpty):
                    self._available.get_nowait()
            self._initialized = False

    async def acquire(self, timeout: float = 30.0) -> str:
        """Get a warm container from the pool."""
        if not self.runtime:
            raise RuntimeError("No container runtime available")

        # Auto-initialize if needed
        if not self._initialized:
            await self.initialize()

        try:
            container_id = await asyncio.wait_for(self._available.get(), timeout=timeout)

            # Health check
            if not await self._is_alive(container_id):
                logger.warning(f"Container {container_id[:12]} dead on acquire, respawning...")
                # Remove dead container from tracking
                async with self._lock:
                    self._all_containers.discard(container_id)
                # Spawn replacement
                new_id = await self._start_warm_container(str(uuid.uuid4())[:8])
                if new_id:
                    async with self._lock:
                        self._all_containers.add(new_id)
                    return new_id
                else:
                    raise RuntimeError("Failed to respawn container")

            return container_id
        except asyncio.TimeoutError:
            raise TimeoutError(f"No sandbox containers available after {timeout}s") from None

    async def release(self, container_id: str) -> None:
        """Return container to pool after cleanup."""
        try:
            # Quick cleanup of workspace
            await self._clean_container_workspace(container_id)
            await self._available.put(container_id)
        except Exception as e:
            logger.error(f"Error releasing container {container_id[:12]}: {e}")
            # If cleanup failed, kill it and spawn new one
            await self._stop_container(container_id)
            async with self._lock:
                self._all_containers.discard(container_id)
            # Spawn replacement
            new_id = await self._start_warm_container(str(uuid.uuid4())[:8])
            if new_id:
                async with self._lock:
                    self._all_containers.add(new_id)
                await self._available.put(new_id)

    def __init__(self, pool_size: int = 3) -> None:
        self.pool_size = pool_size
        self.runtime = get_container_runtime()
        self._available = asyncio.Queue()
        self._all_containers = set()
        self._lock = asyncio.Lock()
        self._initialized = False

    async def ensure_warm(self) -> bool:
        """Deprecated: Use initialize() instead."""
        if not self._initialized:
            await self.initialize()
        return self._initialized

    async def _is_alive(self, container_id: str) -> bool:
        """Check if container is still running."""
        if not container_id or not self.runtime:
            return False

        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "container",
            "inspect",
            "-f",
            "{{.State.Running}}",
            container_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            return stdout.decode().strip() == "true"
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
            logger.warning("Container inspect timed out")
            return False

    async def _cleanup_stale_containers(self) -> None:
        """Remove any orphaned pool containers from previous runs."""
        if not self.runtime:
            return

        # Find containers matching our naming pattern (includes stopped containers with -a)
        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "ps",
            "-aq",  # Include stopped containers
            "--filter",
            "name=chat-juicer-sandbox-pool",  # Matches chat-juicer-sandbox-pool-*
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()

        container_ids = stdout.decode().strip().split()
        if container_ids and container_ids[0]:
            logger.info("Cleaning up %d stale pool container(s)", len(container_ids))
            for cid in container_ids:
                # Use rm -f to force remove (kill + remove) the container
                rm_proc = await asyncio.create_subprocess_exec(
                    self.runtime,
                    "rm",
                    "-f",
                    cid,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await rm_proc.wait()

    async def _start_warm_container(self, suffix: str | int = 0) -> str | None:
        """Start a warm container with pre-imported packages."""
        if not self.runtime:
            return None

        # Name: chat-juicer-sandbox-pool-{suffix}
        name = f"chat-juicer-sandbox-pool-{suffix}"
        logger.info(f"Starting warm sandbox container {name}...")

        # Start container with security restrictions but no immediate command
        # The container runs sleep infinity and we exec into it
        proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "run",
            "-d",  # Detached
            "--rm",  # Remove on exit
            "--name",
            name,
            "--network=none",  # No network access
            "--read-only",  # Read-only root filesystem
            f"--memory={MEMORY_LIMIT}",
            f"--cpus={CPU_LIMIT}",
            "--tmpfs",
            f"/tmp:size={TMP_SIZE}",
            # Use volumes instead of tmpfs for workspace to support 'docker cp' on read-only rootfs
            "-v",
            "/workspace",
            "-v",
            "/input",
            "-v",
            "/output",
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
            "/input",
            "/output",
            "/tmp",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await chown_proc.wait()

        logger.info("Warm container started: %s", container_id[:12])
        return container_id

    async def _clean_container_workspace(self, container_id: str) -> None:
        """Clean up workspace in container between runs."""
        if not self.runtime:
            return

        cleanup_proc = await asyncio.create_subprocess_exec(
            self.runtime,
            "exec",
            container_id,
            "sh",
            "-c",
            "rm -rf /workspace/*",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(cleanup_proc.wait(), timeout=10)
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                cleanup_proc.kill()
            logger.warning(f"Workspace cleanup timed out for {container_id[:12]}")

    async def execute(
        self,
        code: str,
        workspace_path: Path,
        session_files_path: Path | None = None,
    ) -> ExecutionResult:
        """
        Execute code in a warm container from the pool.
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

        # Acquire container from pool
        try:
            container_id = await self.acquire()
        except (TimeoutError, RuntimeError) as e:
            logger.warning(f"Failed to acquire sandbox ({e}), falling back to cold execution")
            return await self._execute_cold(code, workspace_path, session_files_path)

        try:
            result = await self._execute_in_container(container_id, code, workspace_path, session_files_path)

            result.execution_time_ms = int((time.time() - start_time) * 1000)
            result.runtime = runtime
            result.output_dir = str(workspace_path)

            # Collect generated files
            result.files = self._collect_output_files(workspace_path)

            return result
        finally:
            await self.release(container_id)

    async def _execute_in_container(
        self, container_id: str, code: str, workspace_path: Path, session_files_path: Path | None = None
    ) -> ExecutionResult:
        """Execute code in specific warm container via docker exec."""
        if not self.runtime or not container_id:
            return ExecutionResult(success=False, error="Invalid container or runtime")

        try:
            # Copy workspace into container (with timeout)
            success, error = await self._container_cp(
                f"{workspace_path}/.",
                f"{container_id}:/workspace/",
                to_container=True,
            )
            if not success:
                logger.warning(f"Failed to copy workspace to warm container: {error}")
                return ExecutionResult(success=False, error=f"Failed to copy workspace: {error}")

            # Copy session files (input/output) for read access
            if session_files_path:
                input_path = session_files_path / "input"
                output_path = session_files_path / "output"

                # Non-critical: log warning but continue if copy fails
                if input_path.exists():
                    success, error = await self._container_cp(
                        f"{input_path}/.",
                        f"{container_id}:/input/",
                        to_container=True,
                    )
                    if not success:
                        logger.warning(f"Failed to copy input to container: {error}")

                if output_path.exists():
                    success, error = await self._container_cp(
                        f"{output_path}/.",
                        f"{container_id}:/output/",
                        to_container=True,
                    )
                    if not success:
                        logger.warning(f"Failed to copy output to container: {error}")

            # Execute script with timeout
            proc = await asyncio.create_subprocess_exec(
                self.runtime,
                "exec",
                container_id,
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
                with contextlib.suppress(ProcessLookupError):
                    proc.kill()
                await proc.wait()
                return ExecutionResult(
                    success=False,
                    error=f"Execution timed out after {TIMEOUT_SECONDS}s",
                    exit_code=-1,
                )

            # Copy outputs back from container (with timeout)
            success, error = await self._container_cp(
                f"{container_id}:/workspace/.",
                f"{workspace_path}/",
                to_container=False,
            )
            if not success:
                logger.warning(f"Failed to copy outputs from warm container: {error}")
                # We don't fail the whole execution if only output copy fails, but we should note it
                # For now, let's treat it as a warning since we might have stdout
                return ExecutionResult(
                    success=True,  # Execution worked, just file retrieval failed
                    stdout=stdout.decode(),
                    stderr=stderr.decode() + f"\nWarning: Failed to retrieve partial output files: {error}",
                    exit_code=proc.returncode or 0,
                )

            return ExecutionResult(
                success=proc.returncode == 0,
                stdout=stdout.decode("utf-8", errors="replace"),
                stderr=stderr.decode("utf-8", errors="replace"),
                exit_code=proc.returncode or 0,
            )

        except Exception as e:
            logger.warning("Warm execution failed, container may be dead: %s", e)
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
            input_path = session_files_path / "input"
            output_path = session_files_path / "output"
            if input_path.exists():
                cmd_args.extend(["-v", f"{input_path}:/input:ro"])  # Read-only for uploads
            if output_path.exists():
                cmd_args.extend(["-v", f"{output_path}:/output:ro"])  # Read-only access to generated docs

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

    async def _container_cp(self, src: str, dst: str, to_container: bool, timeout: int = 30) -> tuple[bool, str]:
        """Copy files to/from container with timeout.

        Args:
            src: Source path
            dst: Destination path
            to_container: True if copying to container, False if from container
            timeout: Timeout in seconds (default 30s)

        Returns:
            Tuple of (success, error_message)
        """
        if not self.runtime:
            return False, "No runtime available"

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
                err_msg = stderr.decode().strip()
                logger.warning(f"Container cp failed: {err_msg}")
                return False, err_msg
            return True, ""
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
            await proc.wait()
            msg = f"Container cp timed out after {timeout}s: {src} -> {dst}"
            logger.error(msg)
            return False, msg

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
                ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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


# ============================================
# GLOBAL SINGLETON
# ============================================

# Use dict container to avoid 'global' statement (PLW0603)
_state: dict[str, SandboxPool | None] = {"pool": None}


def get_sandbox_pool(pool_size: int = 3) -> SandboxPool:
    """Get or create the global sandbox pool."""
    if _state["pool"] is None:
        _state["pool"] = SandboxPool(pool_size=pool_size)

    pool = _state["pool"]
    assert pool is not None
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
    - /input: Read-only access to uploaded source files (session files)
    - /output: Read-only access to previously generated documents

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

    # Session files path (input/ and output/ for read access)
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
