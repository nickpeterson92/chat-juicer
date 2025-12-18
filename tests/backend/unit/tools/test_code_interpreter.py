"""
Unit tests for code_interpreter module.

Tests sandbox pool management, code execution, and error handling.
"""

from __future__ import annotations

import json

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tools.code_interpreter import (
    ALLOWED_OUTPUT_EXTENSIONS,
    CODE_OUTPUT_SUBDIR,
    IMAGE_EXTENSIONS,
    MAX_FILES_RETURNED,
    MAX_IMAGE_SIZE_FOR_BASE64,
    SANDBOX_IMAGE,
    TIMEOUT_SECONDS,
    ExecutionResult,
    SandboxPool,
    _encode_image_to_base64,
    _inject_matplotlib_autosave,
    _is_image_file,
    check_sandbox_ready,
    execute_python_code,
    get_container_runtime,
    get_sandbox_pool,
    shutdown_sandbox_pool,
)


class TestGetContainerRuntime:
    """Tests for container runtime detection."""

    def test_detects_podman_first(self) -> None:
        """Should prefer podman over docker."""
        with patch("shutil.which") as mock_which:
            mock_which.side_effect = lambda cmd: "/usr/bin/podman" if cmd == "podman" else None
            assert get_container_runtime() == "podman"

    def test_detects_docker_fallback(self) -> None:
        """Should use docker if podman not available."""
        with patch("shutil.which") as mock_which:
            mock_which.side_effect = lambda cmd: "/usr/bin/docker" if cmd == "docker" else None
            assert get_container_runtime() == "docker"

    def test_returns_none_when_no_runtime(self) -> None:
        """Should return None if no container runtime found."""
        with patch("shutil.which", return_value=None):
            assert get_container_runtime() is None


class TestCheckSandboxReady:
    """Tests for sandbox readiness check."""

    def test_returns_false_when_no_runtime(self) -> None:
        """Should return False if no container runtime."""
        with patch("tools.code_interpreter.get_container_runtime", return_value=None):
            ready, msg = check_sandbox_ready()
            assert ready is False
            assert "No container runtime" in msg

    def test_returns_false_when_image_missing(self) -> None:
        """Should return False if sandbox image not built."""
        with (
            patch("tools.code_interpreter.get_container_runtime", return_value="docker"),
            patch("subprocess.run") as mock_run,
        ):
            mock_run.return_value = MagicMock(returncode=1)
            ready, msg = check_sandbox_ready()
            assert ready is False
            assert "not found" in msg
            assert "make build-sandbox" in msg

    def test_returns_true_when_ready(self) -> None:
        """Should return True when runtime and image available."""
        with (
            patch("tools.code_interpreter.get_container_runtime", return_value="podman"),
            patch("subprocess.run") as mock_run,
        ):
            mock_run.return_value = MagicMock(returncode=0)
            ready, msg = check_sandbox_ready()
            assert ready is True
            assert "podman" in msg


class TestExecutionResult:
    """Tests for ExecutionResult dataclass."""

    def test_default_values(self) -> None:
        """Should have sensible defaults."""
        result = ExecutionResult(success=True)
        assert result.success is True
        assert result.stdout == ""
        assert result.stderr == ""
        assert result.exit_code == 0
        assert result.files == []
        assert result.output_dir == ""
        assert result.runtime == ""
        assert result.execution_time_ms == 0
        assert result.error is None

    def test_with_all_fields(self) -> None:
        """Should accept all fields."""
        result = ExecutionResult(
            success=False,
            stdout="output",
            stderr="error",
            exit_code=1,
            files=[{"name": "test.png", "type": "image/png", "path": "/workspace/test.png", "size": 1234}],
            output_dir="/workspace",
            runtime="docker",
            execution_time_ms=500,
            error="Test error",
        )
        assert result.success is False
        assert result.stdout == "output"
        assert result.stderr == "error"
        assert result.exit_code == 1
        assert len(result.files) == 1
        assert result.files[0]["name"] == "test.png"
        assert result.output_dir == "/workspace"
        assert result.runtime == "docker"
        assert result.execution_time_ms == 500
        assert result.error == "Test error"


class TestSandboxPool:
    """Tests for SandboxPool warm container management."""

    @pytest.fixture
    def pool(self) -> SandboxPool:
        """Create a fresh pool instance."""
        with patch("tools.code_interpreter.get_container_runtime", return_value="docker"):
            return SandboxPool()

    def test_init_with_runtime(self, pool: SandboxPool) -> None:
        """Should initialize with detected runtime."""
        assert pool.runtime == "docker"
        assert pool.warm_container_id is None

    def test_init_without_runtime(self) -> None:
        """Should handle missing runtime gracefully."""
        with patch("tools.code_interpreter.get_container_runtime", return_value=None):
            pool = SandboxPool()
            assert pool.runtime is None
            assert pool.warm_container_id is None

    @pytest.mark.asyncio
    async def test_ensure_warm_no_runtime(self) -> None:
        """Should return False if no runtime available."""
        with patch("tools.code_interpreter.get_container_runtime", return_value=None):
            pool = SandboxPool()
            result = await pool.ensure_warm()
            assert result is False

    @pytest.mark.asyncio
    async def test_ensure_warm_starts_container(self, pool: SandboxPool) -> None:
        """Should start warm container when not running."""
        with patch.object(pool, "_start_warm_container", new_callable=AsyncMock) as mock_start:
            mock_start.return_value = "container123"
            result = await pool.ensure_warm()
            assert result is True
            assert pool.warm_container_id == "container123"
            mock_start.assert_called_once()

    @pytest.mark.asyncio
    async def test_ensure_warm_reuses_container(self, pool: SandboxPool) -> None:
        """Should reuse existing warm container if alive."""
        pool.warm_container_id = "existing123"
        with (
            patch.object(pool, "_is_alive", new_callable=AsyncMock, return_value=True),
            patch.object(pool, "_start_warm_container", new_callable=AsyncMock) as mock_start,
        ):
            result = await pool.ensure_warm()
            assert result is True
            mock_start.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_no_runtime(self) -> None:
        """Should return error when no runtime available."""
        with patch("tools.code_interpreter.get_container_runtime", return_value=None):
            pool = SandboxPool()
            result = await pool.execute("print('hi')", Path("/tmp/workspace"))
            assert result.success is False
            assert "No container runtime" in result.error

    @pytest.mark.asyncio
    async def test_execute_cold_fallback(self, pool: SandboxPool, tmp_path: Path) -> None:
        """Should fall back to cold execution if warm fails."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()

        with (
            patch.object(pool, "ensure_warm", new_callable=AsyncMock, return_value=False),
            patch.object(pool, "_execute_cold", new_callable=AsyncMock) as mock_cold,
        ):
            mock_cold.return_value = ExecutionResult(success=True, stdout="output")
            result = await pool.execute("print('hi')", workspace)
            assert result.success is True
            mock_cold.assert_called_once()

    @pytest.mark.asyncio
    async def test_shutdown_kills_container(self, pool: SandboxPool) -> None:
        """Should kill warm container on shutdown."""
        pool.warm_container_id = "container123"

        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec:
            mock_proc = AsyncMock()
            mock_proc.wait = AsyncMock()
            mock_exec.return_value = mock_proc

            await pool.shutdown()

            assert pool.warm_container_id is None
            mock_exec.assert_called_once()

    @pytest.mark.asyncio
    async def test_shutdown_handles_no_container(self, pool: SandboxPool) -> None:
        """Should handle shutdown when no container running."""
        pool.warm_container_id = None
        await pool.shutdown()  # Should not raise

    def test_collect_output_files(self, pool: SandboxPool, tmp_path: Path) -> None:
        """Should collect allowed output files."""
        # Create test files
        (tmp_path / "script.py").write_text("# input")
        (tmp_path / "output.png").write_bytes(b"PNG data")
        (tmp_path / "data.csv").write_text("a,b,c")
        (tmp_path / "ignored.exe").write_bytes(b"binary")

        files = pool._collect_output_files(tmp_path)

        assert len(files) == 2
        names = {f["name"] for f in files}
        assert "output.png" in names
        assert "data.csv" in names
        assert "script.py" not in names
        assert "ignored.exe" not in names

    def test_collect_output_files_respects_limit(self, pool: SandboxPool, tmp_path: Path) -> None:
        """Should respect MAX_FILES_RETURNED limit."""
        # Create more files than the limit
        for i in range(MAX_FILES_RETURNED + 5):
            (tmp_path / f"file{i}.txt").write_text(f"content {i}")

        files = pool._collect_output_files(tmp_path)
        assert len(files) <= MAX_FILES_RETURNED


class TestExecutePythonCode:
    """Tests for main execute_python_code function."""

    @pytest.mark.asyncio
    async def test_creates_workspace_directory(self, tmp_path: Path) -> None:
        """Should create session workspace directory."""
        with (
            patch("tools.code_interpreter.check_sandbox_ready", return_value=(True, "Sandbox ready")),
            patch("tools.code_interpreter.get_sandbox_pool") as mock_get_pool,
            patch("tools.code_interpreter.Path") as mock_path,
        ):
            mock_pool = MagicMock()
            mock_pool.execute = AsyncMock(
                return_value=ExecutionResult(
                    success=True,
                    stdout="output",
                    runtime="docker",
                    execution_time_ms=100,
                )
            )
            mock_get_pool.return_value = mock_pool

            mock_workspace = MagicMock()
            mock_workspace.__truediv__ = MagicMock(return_value=mock_workspace)
            mock_path.return_value = mock_workspace

            result = await execute_python_code("print('hi')", "test_session")
            result_data = json.loads(result)

            assert result_data["success"] is True
            assert result_data["stdout"] == "output"

    @pytest.mark.asyncio
    async def test_returns_json_response(self) -> None:
        """Should return valid JSON response."""
        with (
            patch("tools.code_interpreter.check_sandbox_ready", return_value=(True, "Sandbox ready")),
            patch("tools.code_interpreter.get_sandbox_pool") as mock_get_pool,
        ):
            mock_pool = MagicMock()
            mock_pool.execute = AsyncMock(
                return_value=ExecutionResult(
                    success=True,
                    stdout="Hello World",
                    stderr="",
                    exit_code=0,
                    files=[],
                    output_dir="/workspace",
                    runtime="podman",
                    execution_time_ms=250,
                )
            )
            mock_get_pool.return_value = mock_pool

            result = await execute_python_code("print('Hello World')", "session123")
            data = json.loads(result)

            assert data["success"] is True
            assert data["stdout"] == "Hello World"
            assert data["exit_code"] == 0
            assert data["runtime"] == "podman"
            assert data["execution_time_ms"] == 250

    @pytest.mark.asyncio
    async def test_includes_error_in_response(self) -> None:
        """Should include error message in response."""
        with (
            patch("tools.code_interpreter.check_sandbox_ready", return_value=(True, "Sandbox ready")),
            patch("tools.code_interpreter.get_sandbox_pool") as mock_get_pool,
        ):
            mock_pool = MagicMock()
            mock_pool.execute = AsyncMock(
                return_value=ExecutionResult(
                    success=False,
                    error="Execution timed out after 60s",
                    exit_code=-1,
                )
            )
            mock_get_pool.return_value = mock_pool

            result = await execute_python_code("while True: pass", "session123")
            data = json.loads(result)

            assert data["success"] is False
            assert "timed out" in data["error"]


class TestGlobalPool:
    """Tests for global sandbox pool singleton."""

    def test_get_sandbox_pool_creates_singleton(self) -> None:
        """Should create singleton pool on first call."""
        import tools.code_interpreter as module

        # Reset singleton
        module._state["pool"] = None

        with patch("tools.code_interpreter.get_container_runtime", return_value="docker"):
            pool1 = get_sandbox_pool()
            pool2 = get_sandbox_pool()
            assert pool1 is pool2

        # Clean up
        module._state["pool"] = None

    @pytest.mark.asyncio
    async def test_shutdown_sandbox_pool(self) -> None:
        """Should shutdown and clear singleton pool."""
        import tools.code_interpreter as module

        # Create pool
        with patch("tools.code_interpreter.get_container_runtime", return_value="docker"):
            pool = get_sandbox_pool()
            pool.warm_container_id = None  # No actual container

            await shutdown_sandbox_pool()

            assert module._state["pool"] is None


class TestConfiguration:
    """Tests for module configuration values."""

    def test_sandbox_image_name(self) -> None:
        """Sandbox image should have expected name."""
        assert SANDBOX_IMAGE == "chat-juicer-sandbox:latest"

    def test_timeout_is_reasonable(self) -> None:
        """Timeout should be reasonable (60s as per spec)."""
        assert TIMEOUT_SECONDS == 60

    def test_allowed_extensions(self) -> None:
        """Should allow common output file types."""
        assert ".png" in ALLOWED_OUTPUT_EXTENSIONS
        assert ".csv" in ALLOWED_OUTPUT_EXTENSIONS
        assert ".json" in ALLOWED_OUTPUT_EXTENSIONS
        assert ".html" in ALLOWED_OUTPUT_EXTENSIONS
        assert ".pdf" in ALLOWED_OUTPUT_EXTENSIONS

    def test_code_output_subdir(self) -> None:
        """Output subdir should be 'code'."""
        assert CODE_OUTPUT_SUBDIR == "code"


# ============================================
# PHASE 2: RICH OUTPUT SUPPORT TESTS
# ============================================


class TestImageDetection:
    """Tests for image file detection."""

    def test_is_image_file_png(self, tmp_path: Path) -> None:
        """Should detect PNG files as images."""
        png_file = tmp_path / "plot.png"
        png_file.write_bytes(b"PNG data")
        assert _is_image_file(png_file) is True

    def test_is_image_file_jpg(self, tmp_path: Path) -> None:
        """Should detect JPG files as images."""
        jpg_file = tmp_path / "photo.jpg"
        jpg_file.write_bytes(b"JPEG data")
        assert _is_image_file(jpg_file) is True

    def test_is_image_file_jpeg(self, tmp_path: Path) -> None:
        """Should detect JPEG files as images."""
        jpeg_file = tmp_path / "photo.jpeg"
        jpeg_file.write_bytes(b"JPEG data")
        assert _is_image_file(jpeg_file) is True

    def test_is_image_file_svg(self, tmp_path: Path) -> None:
        """Should detect SVG files as images."""
        svg_file = tmp_path / "diagram.svg"
        svg_file.write_text("<svg></svg>")
        assert _is_image_file(svg_file) is True

    def test_is_image_file_case_insensitive(self, tmp_path: Path) -> None:
        """Should detect images regardless of extension case."""
        png_file = tmp_path / "plot.PNG"
        png_file.write_bytes(b"PNG data")
        assert _is_image_file(png_file) is True

    def test_is_image_file_non_image(self, tmp_path: Path) -> None:
        """Should return False for non-image files."""
        csv_file = tmp_path / "data.csv"
        csv_file.write_text("a,b,c")
        assert _is_image_file(csv_file) is False


class TestBase64Encoding:
    """Tests for base64 image encoding."""

    def test_encode_image_to_base64_success(self, tmp_path: Path) -> None:
        """Should encode small image to base64."""
        image_file = tmp_path / "test.png"
        test_data = b"PNG\x89fake_png_data"
        image_file.write_bytes(test_data)

        result = _encode_image_to_base64(image_file)

        assert result is not None
        import base64

        decoded = base64.b64decode(result)
        assert decoded == test_data

    def test_encode_image_too_large(self, tmp_path: Path) -> None:
        """Should return None for images exceeding size limit."""
        image_file = tmp_path / "large.png"
        # Create file larger than MAX_IMAGE_SIZE_FOR_BASE64
        large_data = b"x" * (MAX_IMAGE_SIZE_FOR_BASE64 + 1)
        image_file.write_bytes(large_data)

        result = _encode_image_to_base64(image_file)
        assert result is None

    def test_encode_image_file_not_found(self, tmp_path: Path) -> None:
        """Should handle missing file gracefully."""
        missing_file = tmp_path / "missing.png"
        result = _encode_image_to_base64(missing_file)
        assert result is None

    def test_encode_image_empty_file(self, tmp_path: Path) -> None:
        """Should handle empty file."""
        empty_file = tmp_path / "empty.png"
        empty_file.write_bytes(b"")

        result = _encode_image_to_base64(empty_file)
        assert result is not None
        assert result == ""  # Empty base64


class TestMatplotlibInjection:
    """Tests for matplotlib auto-save code injection."""

    def test_inject_matplotlib_autosave_adds_imports(self) -> None:
        """Should prepend matplotlib configuration."""
        code = "plt.plot([1, 2, 3])"
        enhanced = _inject_matplotlib_autosave(code)

        assert "import matplotlib" in enhanced
        assert "matplotlib.use('Agg')" in enhanced
        assert "import matplotlib.pyplot as plt" in enhanced

    def test_inject_matplotlib_autosave_adds_save_logic(self) -> None:
        """Should append figure auto-save logic."""
        code = "plt.plot([1, 2, 3])"
        enhanced = _inject_matplotlib_autosave(code)

        assert "plt.get_fignums()" in enhanced
        assert "savefig" in enhanced
        assert "/workspace/figure_" in enhanced

    def test_inject_matplotlib_autosave_preserves_code(self) -> None:
        """Should preserve original user code."""
        code = "x = [1, 2, 3]\nplt.plot(x)\nplt.title('Test')"
        enhanced = _inject_matplotlib_autosave(code)

        assert "x = [1, 2, 3]" in enhanced
        assert "plt.plot(x)" in enhanced
        assert "plt.title('Test')" in enhanced

    def test_inject_matplotlib_autosave_error_handling(self) -> None:
        """Should include error handling for auto-save."""
        code = "plt.plot([1, 2, 3])"
        enhanced = _inject_matplotlib_autosave(code)

        assert "try:" in enhanced
        assert "except Exception" in enhanced


class TestCollectOutputFilesWithBase64:
    """Tests for output file collection with base64 encoding (Phase 2)."""

    @pytest.fixture
    def pool(self) -> SandboxPool:
        """Create sandbox pool with mocked runtime."""
        with patch("tools.code_interpreter.get_container_runtime", return_value="docker"):
            yield SandboxPool()

    def test_collect_output_files_includes_base64_for_images(
        self,
        pool: SandboxPool,
        tmp_path: Path,
    ) -> None:
        """Should include base64 content for image files."""
        # Create test image
        image_file = tmp_path / "plot.png"
        test_data = b"PNG\x89fake_png_data"
        image_file.write_bytes(test_data)

        files = pool._collect_output_files(tmp_path)

        assert len(files) == 1
        assert files[0]["name"] == "plot.png"
        assert files[0]["type"] == "image/png"
        assert "base64" in files[0]
        assert files[0]["base64"] is not None

    def test_collect_output_files_no_base64_for_non_images(
        self,
        pool: SandboxPool,
        tmp_path: Path,
    ) -> None:
        """Should NOT include base64 for non-image files."""
        # Create test CSV
        csv_file = tmp_path / "data.csv"
        csv_file.write_text("a,b,c\n1,2,3")

        files = pool._collect_output_files(tmp_path)

        assert len(files) == 1
        assert files[0]["name"] == "data.csv"
        assert files[0]["type"] == "text/csv"
        assert "base64" not in files[0]

    def test_collect_output_files_mixed_types(
        self,
        pool: SandboxPool,
        tmp_path: Path,
    ) -> None:
        """Should handle mixed image and non-image files."""
        # Create mixed files
        (tmp_path / "plot.png").write_bytes(b"PNG data")
        (tmp_path / "data.csv").write_text("a,b,c")
        (tmp_path / "results.json").write_text('{"key": "value"}')

        files = pool._collect_output_files(tmp_path)

        assert len(files) == 3

        # Find each file type
        png_file = next(f for f in files if f["name"] == "plot.png")
        csv_file = next(f for f in files if f["name"] == "data.csv")
        json_file = next(f for f in files if f["name"] == "results.json")

        # PNG should have base64
        assert "base64" in png_file
        assert png_file["type"] == "image/png"

        # CSV and JSON should not
        assert "base64" not in csv_file
        assert "base64" not in json_file

    def test_collect_output_files_skips_oversized_images(
        self,
        pool: SandboxPool,
        tmp_path: Path,
    ) -> None:
        """Should skip base64 encoding for oversized images but still include metadata."""
        # Create oversized image (but under MAX_OUTPUT_SIZE)
        large_image = tmp_path / "large.png"
        large_data = b"x" * (MAX_IMAGE_SIZE_FOR_BASE64 + 1)
        large_image.write_bytes(large_data)

        files = pool._collect_output_files(tmp_path)

        assert len(files) == 1
        assert files[0]["name"] == "large.png"
        assert "base64" not in files[0] or files[0]["base64"] is None


class TestPhase2Integration:
    """Integration tests for Phase 2 features."""

    @pytest.mark.asyncio
    async def test_execute_injects_matplotlib_code(self, tmp_path: Path) -> None:
        """Should inject matplotlib code before execution."""
        pool = SandboxPool()
        pool.runtime = "docker"

        workspace = tmp_path / "workspace"
        workspace.mkdir()

        # Mock the actual execution
        with patch.object(pool, "_execute_cold", new_callable=AsyncMock) as mock_cold:
            mock_cold.return_value = ExecutionResult(success=True)

            await pool.execute("plt.plot([1, 2, 3])", workspace)

            # Check that script was written with injected code
            script_path = workspace / "script.py"
            assert script_path.exists()
            script_content = script_path.read_text()

            assert "import matplotlib" in script_content
            assert "matplotlib.use('Agg')" in script_content
            assert "plt.get_fignums()" in script_content

    @pytest.mark.asyncio
    async def test_execute_python_code_returns_base64_images(self) -> None:
        """Integration test: execute_python_code returns images with base64."""
        with (
            patch("tools.code_interpreter.check_sandbox_ready", return_value=(True, "Sandbox ready")),
            patch("tools.code_interpreter.get_sandbox_pool") as mock_get_pool,
        ):
            mock_pool = MagicMock()

            # Simulate execution result with image file
            mock_pool.execute = AsyncMock(
                return_value=ExecutionResult(
                    success=True,
                    stdout="Plot created",
                    files=[
                        {
                            "name": "figure_1.png",
                            "type": "image/png",
                            "path": "/workspace/figure_1.png",
                            "size": 1234,
                            "base64": "iVBORw0KGgoAAAANSUhEUgAAAAUA",
                        }
                    ],
                    runtime="docker",
                    execution_time_ms=500,
                )
            )
            mock_get_pool.return_value = mock_pool

            result = await execute_python_code("plt.plot([1,2,3])", "test_session")
            data = json.loads(result)

            assert data["success"] is True
            assert len(data["files"]) == 1
            assert data["files"][0]["name"] == "figure_1.png"
            assert "base64" in data["files"][0]
            assert data["files"][0]["base64"] == "iVBORw0KGgoAAAANSUhEUgAAAAUA"


class TestPhase2Configuration:
    """Tests for Phase 2 configuration values."""

    def test_image_extensions_defined(self) -> None:
        """Should have image extensions configured."""
        assert {".png", ".jpg", ".jpeg", ".svg"} == IMAGE_EXTENSIONS

    def test_max_image_size_for_base64(self) -> None:
        """Should have reasonable size limit for base64 encoding."""
        assert MAX_IMAGE_SIZE_FOR_BASE64 == 5 * 1024 * 1024  # 5MB
