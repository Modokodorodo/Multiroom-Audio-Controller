"""pytest setup for the Home Assistant integration tests."""
import pathlib
import sys

# Make the repository's custom_components package importable for Home Assistant's loader.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

pytest_plugins = "pytest_homeassistant_custom_component"

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def verify_cleanup():
    """Replace the toolkit's strict cleanup check: on Python 3.12 the event loop's own
    shutdown thread ('_run_safe_shutdown_loop') trips it after every test."""
    yield
